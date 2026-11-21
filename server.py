import json
import os
import secrets
import time
from datetime import datetime
from http.cookies import SimpleCookie
from http.server import SimpleHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse, parse_qs

DATA_FILE = "data.json"
DEFAULT_USERS = {
    "victim": {"password": "pass123", "is_admin": False},
    "admin": {"password": "565", "is_admin": True}
}
DEFAULT_SERVERS = {
    "hub": {
        "name": "DisJS Hub",
        "owner": "admin",
        "admins": [],
        "members": [],
        "invite": "PUBLIC",
        "channels": ["general", "memes"],
        "roles": {"VIP": "#f0b232"},
        "member_roles": {}
    }
}

def load_data():
    if os.path.exists(DATA_FILE):
        with open(DATA_FILE, "r") as f:
            d = json.load(f)
            d.setdefault("servers", DEFAULT_SERVERS.copy())
            return d
    return {"users": DEFAULT_USERS.copy(), "servers": DEFAULT_SERVERS.copy(), "messages": []}

def save_data():
    with open(DATA_FILE, "w") as f:
        json.dump({"users": USERS, "servers": SERVERS, "messages": MESSAGES}, f, indent=2)

state = load_data()
USERS = state["users"]
SERVERS = state["servers"]
MESSAGES = state["messages"]
SESSIONS = {}
LAST_SEEN = {}

class AuthHandler(SimpleHTTPRequestHandler):
    def get_current_user(self):
        cookie_header = self.headers.get("Cookie")
        if not cookie_header:
            return None
        cookie = SimpleCookie()
        cookie.load(cookie_header)
        if "session" in cookie:
            username = SESSIONS.get(cookie["session"].value)
            if username in USERS:
                LAST_SEEN[username] = time.time()
                return username
        return None

    def is_site_admin(self, user=None):
        user = user or self.get_current_user()
        return bool(user and USERS.get(user, {}).get("is_admin"))

    def is_server_member(self, srv_id, user=None):
        user = user or self.get_current_user()
        srv = SERVERS.get(srv_id)
        if not user or not srv:
            return False
        if srv_id == "hub" or self.is_site_admin(user):
            return True
        return user == srv["owner"] or user in srv.get("members", []) or user in srv["admins"]

    def is_server_owner(self, srv_id, user=None):
        user = user or self.get_current_user()
        srv = SERVERS.get(srv_id)
        return bool(user and srv and (srv["owner"] == user or self.is_site_admin(user)))

    def is_server_admin(self, srv_id, user=None):
        user = user or self.get_current_user()
        srv = SERVERS.get(srv_id)
        if not user or not srv:
            return False
        return self.is_server_owner(srv_id, user) or (user in srv["admins"])

    def send_json(self, code, payload):
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(payload).encode())
    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        qs = parse_qs(parsed.query)

        if path == "/data.json":
            self.send_json(403, {"error": "Forbidden"})
            return

        if path in ("/dashboard", "/dashboard/", "/dashboard/index.html"):
            if not self.get_current_user():
                self.send_response(302)
                self.send_header("Location", "/")
                self.end_headers()
                return
            self.path = "/dashboard/index.html"

        elif path == "/api/me":
            user = self.get_current_user()
            self.send_json(200 if user else 401, {
                "username": user,
                "is_site_admin": self.is_site_admin(user)
            })
            return

        elif path == "/api/state":
            me = self.get_current_user()
            if not me:
                self.send_json(401, {"error": "Unauthorized"})
                return
            srv_id = qs.get("server", ["hub"])[0]
            if srv_id not in SERVERS or not self.is_server_member(srv_id, me):
                srv_id = "hub"
            srv = SERVERS[srv_id]
            now = time.time()

            members = []
            for u, info in USERS.items():
                if not self.is_server_member(srv_id, u):
                    continue
                u_roles = srv["member_roles"].get(u, [])
                role_objs = [{"name": r, "color": srv["roles"][r]} for r in u_roles if r in srv["roles"]]
                members.append({
                    "username": u,
                    "is_site_admin": info["is_admin"],
                    "is_owner": srv["owner"] == u,
                    "is_srv_admin": u in srv["admins"],
                    "roles": role_objs,
                    "status": info.get("status", ""),
                    "color": info.get("color", ""),
                    "online": (now - LAST_SEEN.get(u, 0)) < 10
                })

            all_users = [
                {"username": u, "online": (now - LAST_SEEN.get(u, 0)) < 10}
                for u in USERS.keys() if u != me
            ]
            srv_list = [
                {"id": k, "name": v["name"]}
                for k, v in SERVERS.items() if self.is_server_member(k, me)
            ]
            self.send_json(200, {
                "servers": srv_list,
                "all_users": all_users,
                "current_server": {
                    "id": srv_id,
                    "name": srv["name"],
                    "owner": srv["owner"],
                    "invite": srv.get("invite", "PUBLIC"),
                    "banner": srv.get("banner", "#18191c"),
                    "channels": srv["channels"],
                    "roles": srv["roles"],
                    "can_manage": self.is_server_admin(srv_id, me),
                    "can_promote": self.is_server_owner(srv_id, me)
                },
                "members": members
            })
            return

        elif path == "/api/messages":
            me = self.get_current_user()
            if not me:
                self.send_json(401, {"error": "Unauthorized"})
                return
            visible = []
            for m in MESSAGES:
                if m.get("type") == "dm":
                    if m.get("from") == me or m.get("to") == me:
                        visible.append(m)
                else:
                    s_id = m.get("server", "hub")
                    if self.is_server_member(s_id, me):
                        visible.append(m)
            self.send_json(200, {"messages": visible})
            return

        elif path == "/logout":
            cookie_header = self.headers.get("Cookie")
            if cookie_header:
                cookie = SimpleCookie()
                cookie.load(cookie_header)
                if "session" in cookie:
                    uname = SESSIONS.pop(cookie["session"].value, None)
                    if uname:
                        LAST_SEEN.pop(uname, None)
            self.send_response(302)
            self.send_header("Set-Cookie", "session=; Path=/; Max-Age=0")
            self.send_header("Location", "/")
            self.end_headers()
            return

        super().do_GET()
    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        data = json.loads(self.rfile.read(length)) if length else {}

        if self.path == "/login":
            u = data.get("username", "").strip()
            p = data.get("password", "")
            if u in USERS and USERS[u]["password"] == p:
                tok = secrets.token_hex(16)
                SESSIONS[tok] = u
                LAST_SEEN[u] = time.time()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Set-Cookie", f"session={tok}; Path=/; HttpOnly")
                self.end_headers()
                self.wfile.write(json.dumps({"status": "Success"}).encode())
            else:
                self.send_json(401, {"status": "Invalid"})

        elif self.path == "/register":
            u = data.get("username", "").strip()
            p = data.get("password", "").strip()
            if not u or not p or u in USERS:
                self.send_json(400, {"error": "Invalid or taken username"})
                return
            USERS[u] = {"password": p, "is_admin": False}
            save_data()
            self.send_json(200, {"status": "Registered"})

        elif self.path == "/api/me/settings":
            me = self.get_current_user()
            if not me:
                self.send_json(401, {"error": "Unauthorized"})
                return
            USERS[me]["status"] = data.get("status", "").strip()[:40]
            USERS[me]["color"] = data.get("color", "").strip()
            old_p = data.get("old_password", "")
            new_p = data.get("new_password", "").strip()
            if new_p:
                if USERS[me]["password"] != old_p:
                    self.send_json(400, {"error": "Current password is incorrect"})
                    return
                USERS[me]["password"] = new_p
            save_data()
            self.send_json(200, {"status": "Saved"})

        elif self.path == "/api/servers/create":
            me = self.get_current_user()
            if not me:
                self.send_json(401, {"error": "Unauthorized"})
                return
            name = data.get("name", "").strip()
            if not name:
                self.send_json(400, {"error": "Server name required"})
                return
            srv_id = secrets.token_hex(4)
            invite_code = secrets.token_hex(3).upper()
            SERVERS[srv_id] = {
                "name": name[:30], "owner": me, "admins": [],
                "members": [me], "invite": invite_code,
                "channels": ["general"], "roles": {}, "member_roles": {}
            }
            save_data()
            self.send_json(200, {"id": srv_id, "invite": invite_code})

        elif self.path == "/api/servers/join":
            me = self.get_current_user()
            if not me:
                self.send_json(401, {"error": "Unauthorized"})
                return
            code = data.get("invite", "").strip().upper()
            for k, srv in SERVERS.items():
                if srv.get("invite", "").upper() == code and code != "PUBLIC":
                    members = srv.setdefault("members", [])
                    if me not in members:
                        members.append(me)
                        save_data()
                    self.send_json(200, {"id": k})
                    return
            self.send_json(404, {"error": "Invalid invite code"})

        elif self.path == "/api/servers/rename":
            srv_id = data.get("server", "")
            if not self.is_server_admin(srv_id):
                self.send_json(403, {"error": "Forbidden"})
                return
            if data.get("name", "").strip():
                SERVERS[srv_id]["name"] = data["name"].strip()[:30]
            if data.get("banner", "").strip():
                SERVERS[srv_id]["banner"] = data["banner"].strip()
            save_data()
            self.send_json(200, {"status": "Updated"})

        elif self.path == "/api/servers/delete":
            srv_id = data.get("server", "")
            if not self.is_server_owner(srv_id) or srv_id == "hub":
                self.send_json(400, {"error": "Cannot delete this server"})
                return
            SERVERS.pop(srv_id, None)
            save_data()
            self.send_json(200, {"status": "Deleted"})
        elif self.path == "/api/channels/add":
            srv_id = data.get("server", "")
            if not self.is_server_admin(srv_id):
                self.send_json(403, {"error": "Forbidden"})
                return
            ch = data.get("name", "").strip().lower().replace(" ", "-")
            if not ch or ch in SERVERS[srv_id]["channels"]:
                self.send_json(400, {"error": "Invalid or existing channel"})
                return
            SERVERS[srv_id]["channels"].append(ch)
            save_data()
            self.send_json(200, {"status": "Created"})

        elif self.path == "/api/channels/delete":
            srv_id, ch = data.get("server", ""), data.get("name", "")
            if not self.is_server_admin(srv_id) or ch == "general":
                self.send_json(400, {"error": "Cannot delete general"})
                return
            if ch in SERVERS[srv_id]["channels"]:
                SERVERS[srv_id]["channels"].remove(ch)
                save_data()
            self.send_json(200, {"status": "Deleted"})

        elif self.path == "/api/roles/create":
            srv_id = data.get("server", "")
            if not self.is_server_admin(srv_id):
                self.send_json(403, {"error": "Forbidden"})
                return
            r_name = data.get("name", "").strip()
            if not r_name:
                self.send_json(400, {"error": "Role name required"})
                return
            SERVERS[srv_id]["roles"][r_name[:20]] = data.get("color", "#5865f2").strip()
            save_data()
            self.send_json(200, {"status": "Role created"})

        elif self.path == "/api/roles/delete":
            srv_id, r_name = data.get("server", ""), data.get("name", "")
            if not self.is_server_admin(srv_id):
                self.send_json(403, {"error": "Forbidden"})
                return
            SERVERS[srv_id]["roles"].pop(r_name, None)
            for u_roles in SERVERS[srv_id]["member_roles"].values():
                if r_name in u_roles:
                    u_roles.remove(r_name)
            save_data()
            self.send_json(200, {"status": "Deleted"})

        elif self.path == "/api/roles/toggle":
            srv_id, target, r_name = data.get("server", ""), data.get("username", ""), data.get("role", "")
            if not self.is_server_admin(srv_id):
                self.send_json(403, {"error": "Forbidden"})
                return
            srv = SERVERS[srv_id]
            if target not in USERS or r_name not in srv["roles"]:
                self.send_json(400, {"error": "Invalid user or role"})
                return
            m_roles = srv["member_roles"].setdefault(target, [])
            if r_name in m_roles:
                m_roles.remove(r_name)
            else:
                m_roles.append(r_name)
            save_data()
            self.send_json(200, {"status": "Updated"})

        elif self.path == "/api/servers/toggle_admin":
            srv_id, target = data.get("server", ""), data.get("username", "")
            if not self.is_server_owner(srv_id):
                self.send_json(403, {"error": "Forbidden"})
                return
            srv = SERVERS[srv_id]
            if target not in USERS or target == srv["owner"]:
                self.send_json(400, {"error": "Invalid target"})
                return
            if target in srv["admins"]:
                srv["admins"].remove(target)
            else:
                srv["admins"].append(target)
            save_data()
            self.send_json(200, {"status": "Updated"})

        elif self.path == "/api/users/password":
            if not self.is_site_admin():
                self.send_json(403, {"error": "Forbidden"})
                return
            target, new_pass = data.get("username", ""), data.get("password", "").strip()
            if target not in USERS or target == self.get_current_user() or not new_pass:
                self.send_json(400, {"error": "Invalid request"})
                return
            USERS[target]["password"] = new_pass
            save_data()
            for tok, uname in list(SESSIONS.items()):
                if uname == target:
                    SESSIONS.pop(tok, None)
            self.send_json(200, {"status": "Updated"})

        elif self.path == "/api/users/delete":
            if not self.is_site_admin():
                self.send_json(403, {"error": "Forbidden"})
                return
            target = data.get("username", "")
            if target == self.get_current_user():
                self.send_json(400, {"error": "Cannot delete yourself"})
                return
            USERS.pop(target, None)
            save_data()
            for tok, uname in list(SESSIONS.items()):
                if uname == target:
                    SESSIONS.pop(tok, None)
            self.send_json(200, {"status": "Deleted"})

        elif self.path == "/api/messages":
            user = self.get_current_user()
            if not user:
                self.send_json(401, {"error": "Unauthorized"})
                return
            text = data.get("text", "").strip()
            msg_type = data.get("type", "channel")
            srv_id = data.get("server", "hub")
            target = data.get("to", "general")
            if not text:
                self.send_json(400, {"error": "Empty message"})
                return
            if msg_type == "channel" and not self.is_server_member(srv_id, user):
                self.send_json(403, {"error": "Not a member of this server"})
                return
            MESSAGES.append({
                "id": secrets.token_hex(6),
                "type": msg_type,
                "server": srv_id,
                "from": user,
                "to": target,
                "time": datetime.now().strftime("%H:%M"),
                "text": text[:300]
            })
            if len(MESSAGES) > 200:
                MESSAGES.pop(0)
            save_data()
            self.send_json(200, {"status": "Sent"})

        elif self.path == "/api/messages/delete":
            me = self.get_current_user()
            if not me:
                self.send_json(401, {"error": "Unauthorized"})
                return
            msg_id = data.get("id", "")
            for i, m in enumerate(MESSAGES):
                if m.get("id") == msg_id:
                    srv_id = m.get("server", "hub")
                    can_del = (
                        m.get("from") == me
                        or self.is_site_admin(me)
                        or (m.get("type") == "channel" and self.is_server_admin(srv_id, me))
                    )
                    if not can_del:
                        self.send_json(403, {"error": "Forbidden"})
                        return
                    MESSAGES.pop(i)
                    save_data()
                    self.send_json(200, {"status": "Deleted"})
                    return
            self.send_json(404, {"error": "Message not found"})

port = int(os.environ.get("PORT", 8000))
print(f"Running DisJS on port {port}")
HTTPServer(("0.0.0.0", port), AuthHandler).serve_forever()
