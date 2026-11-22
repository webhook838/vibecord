let currentUsername = "";
let isSiteAdmin = false;
let currentServerId = "hub";
let inHomeView = false;
let activeType = "channel";
let activeTarget = "general";
let cachedMembers = [];
let cachedServer = null;
let selectedBanner = "#18191c";

const BANNER_COLORS = [
    "#18191c", "#ec4899", "#ef4444", "#f97316", "#eab308",
    "#8b5cf6", "#3b82f6", "#14b8a6", "#22c55e", "#4b5563"
];

const ROLE_PERMS = [
    { key: "manage_channels", label: "Manage Channels" },
    { key: "manage_roles", label: "Manage Roles" },
    { key: "delete_messages", label: "Delete Messages" }
];

function askUser({ title, desc = "", placeholder = "", confirmOnly = false, danger = false }) {
    return new Promise(resolve => {
        const modal = document.getElementById("ask_modal");
        const input = document.getElementById("ask_input");
        const okBtn = document.getElementById("ask_ok");
        document.getElementById("ask_title").textContent = title;
        document.getElementById("ask_desc").textContent = desc;
        document.getElementById("ask_desc").style.display = desc ? "block" : "none";
        input.style.display = confirmOnly ? "none" : "block";
        input.placeholder = placeholder;
        input.value = "";
        okBtn.style.background = danger ? "#da373c" : "#5865f2";
        modal.style.display = "flex";
        if (!confirmOnly) input.focus();

        const finish = val => {
            modal.style.display = "none";
            resolve(val);
        };
        okBtn.onclick = () => finish(confirmOnly ? true : input.value.trim());
        document.getElementById("ask_cancel").onclick = () => finish(null);
        document.getElementById("ask_close").onclick = () => finish(null);
        input.onkeydown = e => {
            if (e.key === "Enter") finish(input.value.trim());
            if (e.key === "Escape") finish(null);
        };
    });
}

function getAvatarColor(name) {
    const member = cachedMembers.find(u => u.username === name);
    if (member && member.color) return member.color;
    const colors = ["#5865f2", "#23a55a", "#f0b232", "#da373c", "#a855f7", "#ec4899"];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
}

function closeModals() {
    document.getElementById("user_modal").style.display = "none";
    document.getElementById("srv_modal").style.display = "none";
    document.getElementById("add_srv_modal").style.display = "none";
    document.getElementById("ask_modal").style.display = "none";
}

document.addEventListener("keydown", e => {
    if (e.key === "Escape") closeModals();
});

function switchSrvTab(tabName) {
    document.querySelectorAll(".fs-tab[data-tab]").forEach(t => {
        t.classList.toggle("active", t.dataset.tab === tabName);
    });
    document.querySelectorAll(".srv-tab-pane").forEach(p => {
        p.style.display = (p.id === "tab_" + tabName) ? "block" : "none";
    });
}

function openHomeDMs() {
    inHomeView = true;
    const other = cachedMembers.find(m => m.username !== currentUsername);
    activeType = "dm";
    activeTarget = other ? other.username : currentUsername;
    document.getElementById("chat_header").textContent = "@ " + activeTarget;
    document.getElementById("chat_input").placeholder = "Message @" + activeTarget;
    loadState();
}

function switchServer(srvId) {
    inHomeView = false;
    currentServerId = srvId;
    activeType = "channel";
    activeTarget = "general";
    document.getElementById("chat_header").textContent = "# general";
    document.getElementById("chat_input").placeholder = "Message #general";
    loadState();
}

function switchChat(type, target) {
    activeType = type;
    activeTarget = target;
    const prefix = type === "channel" ? "# " : "@ ";
    document.getElementById("chat_header").textContent = prefix + target;
    document.getElementById("chat_input").placeholder = "Message " + prefix + target;
    loadState();
}

async function postJson(url, body) {
    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
    });
    if (res.status === 401) window.location.href = "/";
    return res;
}
function renderServerModal() {
    if (!cachedServer) return;
    document.getElementById("fs_srv_cat").textContent = cachedServer.name;
    document.getElementById("set_srv_name").value = cachedServer.name;
    document.getElementById("srv_invite_code").value = cachedServer.invite || "PUBLIC";
    selectedBanner = cachedServer.banner || "#18191c";

    const updatePreview = () => {
        const nm = document.getElementById("set_srv_name").value || cachedServer.name;
        document.getElementById("preview_title").textContent = nm;
        document.getElementById("preview_icon").textContent = nm.slice(0, 2).toUpperCase();
        document.getElementById("preview_banner").style.background =
            `linear-gradient(180deg, ${selectedBanner}, #0b0c0e)`;
        const onCount = cachedMembers.filter(m => m.online).length;
        document.getElementById("preview_stats").textContent =
            `● ${onCount} Online • ${cachedMembers.length} Members`;
    };
    document.getElementById("set_srv_name").oninput = updatePreview;

    const swBox = document.getElementById("banner_swatches");
    swBox.innerHTML = "";
    for (const c of BANNER_COLORS) {
        const sw = document.createElement("div");
        sw.className = "swatch" + (c === selectedBanner ? " selected" : "");
        sw.style.background = c;
        sw.onclick = () => { selectedBanner = c; renderServerModal(); };
        swBox.appendChild(sw);
    }
    updatePreview();

    document.getElementById("delete_srv_btn").style.display =
        (cachedServer.can_promote && cachedServer.id !== "hub") ? "block" : "none";

    const rList = document.getElementById("manage_roles_list");
    rList.style.display = "block";
    rList.innerHTML = "";
    for (const [rName, rData] of Object.entries(cachedServer.roles)) {
        const rColor = typeof rData === "object" ? rData.color : rData;
        const activePerms = (typeof rData === "object" && rData.perms) ? rData.perms : [];

        const card = document.createElement("div");
        card.className = "role-perm-card";

        const head = document.createElement("div");
        head.className = "role-perm-head";
        const title = document.createElement("span");
        title.style.color = rColor;
        title.textContent = "● " + rName;
        head.appendChild(title);

        if (cachedServer.can_manage) {
            const del = document.createElement("button");
            del.className = "close-btn";
            del.textContent = "✕";
            del.onclick = async () => {
                await postJson("/api/roles/delete", { server: cachedServer.id, name: rName });
                await loadState(); renderServerModal();
            };
            head.appendChild(del);
        }
        card.appendChild(head);

        const toggles = document.createElement("div");
        toggles.className = "perm-toggles";
        for (const p of ROLE_PERMS) {
            const has = activePerms.includes(p.key);
            const pill = document.createElement("button");
            pill.className = "perm-pill" + (has ? " active" : "");
            pill.textContent = (has ? "✓ " : "+ ") + p.label;
            pill.disabled = !cachedServer.can_promote;
            pill.onclick = async () => {
                const next = has ? activePerms.filter(x => x !== p.key) : [...activePerms, p.key];
                await postJson("/api/roles/perms", { server: cachedServer.id, name: rName, perms: next });
                await loadState(); renderServerModal();
            };
            toggles.appendChild(pill);
        }
        card.appendChild(toggles);
        rList.appendChild(card);
    }

    const cList = document.getElementById("manage_channels_list");
    cList.innerHTML = "";
    for (const ch of cachedServer.channels) {
        if (ch === "general") continue;
        const chip = document.createElement("div");
        chip.className = "chip";
        chip.textContent = "# " + ch;
        const del = document.createElement("button");
        del.textContent = "✕";
        del.onclick = async () => {
            await postJson("/api/channels/delete", { server: cachedServer.id, name: ch });
            if (activeTarget === ch) switchChat("channel", "general");
            await loadState(); renderServerModal();
        };
        chip.appendChild(del);
        cList.appendChild(chip);
    }
    const bList = document.getElementById("manage_bots_list");
    if (bList) {
        bList.innerHTML = "";
        for (const b of (cachedServer.bots || [])) {
            const card = document.createElement("div");
            card.className = "role-perm-card";
            const head = document.createElement("div");
            head.className = "role-perm-head";
            head.innerHTML = `<span>🤖 ${b.name} <span class="bot-badge">BOT</span></span>`;
            const del = document.createElement("button");
            del.className = "close-btn";
            del.textContent = "✕";
            del.onclick = async () => {
                await postJson("/api/bots/delete", { server: cachedServer.id, id: b.id });
                await loadState(); renderServerModal();
            };
            head.appendChild(del);
            card.appendChild(head);
   
            const info = document.createElement("div");
            info.style.cssText = "font-size:12px; color:#b5bac1;";
            info.textContent = `WHEN message ${b.trigger} "${b.trigger_val}"  ➔  DO ${b.action} ${b.action_val ? '"' + b.action_val + '"' : ""}`;
            card.appendChild(info);
            bList.appendChild(card);
        }
    }
   
}

function buildMemberRow(m, srv) {
    const row = document.createElement("div");
    row.className = "member-row";
    const info = document.createElement("div");
    info.className = "member-info";

    const dot = document.createElement("span");
    dot.className = "status-dot" + (m.online ? " online" : "");
    info.appendChild(dot);

    const nameSpan = document.createElement("span");
    nameSpan.textContent = m.username + (m.is_owner ? " 👑" : "");
    if (m.roles.length > 0) nameSpan.style.color = m.roles.color;
    else if (!m.online) nameSpan.style.color = "#80848e";
    info.appendChild(nameSpan);

    if (m.is_site_admin) {
        const b = document.createElement("span"); b.className = "badge"; b.textContent = "ADMIN"; info.appendChild(b);
    } else if (m.is_srv_admin) {
        const b = document.createElement("span"); b.className = "badge"; b.style.background = "#23a55a"; b.textContent = "MOD"; info.appendChild(b);
    }

    for (const r of m.roles) {
        const pill = document.createElement("span");
        pill.className = "role-pill"; pill.style.color = r.color; pill.style.borderColor = r.color;
        pill.textContent = r.name; info.appendChild(pill);
    }
    row.appendChild(info);

    if (m.status) {
        const st = document.createElement("div");
        st.className = "member-status"; st.textContent = m.status;
        row.appendChild(st);
    }

    if (srv.can_manage_roles || srv.can_promote || isSiteAdmin) {
        const actions = document.createElement("div");
        actions.className = "admin-actions";
        if (srv.can_manage_roles && Object.keys(srv.roles).length > 0) {
            const rb = document.createElement("button"); rb.textContent = "+Role";
            rb.onclick = async () => {
                const rn = await askUser({
                    title: "Toggle Role for " + m.username,
                    desc: "Available roles: " + Object.keys(srv.roles).join(", "),
                    placeholder: "Role name"
                });
                if (rn) { await postJson("/api/roles/toggle", { server: srv.id, username: m.username, role: rn }); loadState(); }
            };
            actions.appendChild(rb);
        }
        if (srv.can_promote && !m.is_owner && m.username !== currentUsername) {
            const mb = document.createElement("button"); mb.textContent = m.is_srv_admin ? "-Mod" : "+Mod";
            mb.onclick = async () => { await postJson("/api/servers/toggle_admin", { server: srv.id, username: m.username }); loadState(); };
            actions.appendChild(mb);
        }
        if (isSiteAdmin && m.username !== currentUsername) {
            const pb = document.createElement("button"); pb.textContent = "Key";
            pb.onclick = async () => {
                const p = await askUser({
                    title: "Reset Password",
                    desc: "Enter a new password for " + m.username + ":",
                    placeholder: "New password"
                });
                if (p) await postJson("/api/users/password", { username: m.username, password: p });
            };
            actions.appendChild(pb);
            const db = document.createElement("button"); db.className = "del"; db.textContent = "X";
            db.onclick = async () => {
                const ok = await askUser({
                    title: "Delete User",
                    desc: "Permanently delete account '" + m.username + "'?",
                    confirmOnly: true,
                    danger: true
                });
                if (ok) { await postJson("/api/users/delete", { username: m.username }); loadState(); }
            };
            actions.appendChild(db);
        }
        if (actions.children.length > 0) row.appendChild(actions);
    }
    return row;
}
async function loadState() {
    const res = await fetch("/api/state?server=" + encodeURIComponent(currentServerId));
    if (res.status === 401) { window.location.href = "/"; return; }
    if (!res.ok) return;
    const data = await res.json();
    const srv = data.current_server;
    cachedServer = srv;
    currentServerId = srv.id;
    cachedMembers = data.members;

    const rail = document.getElementById("server_rail");
    rail.innerHTML = "";

    const homeBtn = document.createElement("div");
    homeBtn.className = "srv-icon" + (inHomeView ? " active" : "");
    homeBtn.textContent = "💬";
    homeBtn.title = "Direct Messages";
    homeBtn.onclick = openHomeDMs;
    rail.appendChild(homeBtn);

    const sep = document.createElement("div");
    sep.className = "rail-sep";
    rail.appendChild(sep);

    for (const s of data.servers) {
        const icon = document.createElement("div");
        icon.className = "srv-icon" + (!inHomeView && s.id === srv.id ? " active" : "");
        icon.textContent = s.name.slice(0, 2).toUpperCase();
        icon.title = s.name;
        icon.onclick = () => switchServer(s.id);
        rail.appendChild(icon);
    }

    const addSrv = document.createElement("div");
    addSrv.className = "srv-icon add-srv";
    addSrv.textContent = "+";
    addSrv.title = "Create or Join Server";
    addSrv.onclick = () => {
        document.getElementById("create_srv_name").value = "";
        document.getElementById("join_srv_code").value = "";
        document.getElementById("add_srv_msg").textContent = "";
        document.getElementById("add_srv_modal").style.display = "flex";
    };
    rail.appendChild(addSrv);

    document.getElementById("server_title").textContent = inHomeView ? "Direct Messages" : srv.name;
    document.getElementById("srv_settings_btn").style.display = (!inHomeView && srv.can_manage) ? "inline" : "none";
    document.getElementById("channel_section").style.display = inHomeView ? "none" : "block";
    document.getElementById("dm_section").style.display = inHomeView ? "block" : "none";
    document.getElementById("add_channel_btn").style.display = srv.can_manage_channels ? "inline" : "none";

    const chList = document.getElementById("channel_list");
    chList.innerHTML = "";
    for (const ch of srv.channels) {
        const div = document.createElement("div");
        div.className = "nav-item" + (activeType === "channel" && activeTarget === ch ? " active" : "");
        div.textContent = "# " + ch;
        div.onclick = () => switchChat("channel", ch);
        chList.appendChild(div);
    }

    const dmList = document.getElementById("dm_list");
    const onList = document.getElementById("online_list");
    const offList = document.getElementById("offline_list");
    dmList.innerHTML = ""; onList.innerHTML = ""; offList.innerHTML = "";

    for (const u of (data.all_users || [])) {
        const dm = document.createElement("div");
        dm.className = "nav-item" + (activeType === "dm" && activeTarget === u.username ? " active" : "");
        const dot = document.createElement("span");
        dot.className = "status-dot" + (u.online ? " online" : "");
        dm.appendChild(dot);
        dm.appendChild(document.createTextNode(u.username));
        dm.onclick = () => switchChat("dm", u.username);
        dmList.appendChild(dm);
    }

    let onCount = 0, offCount = 0;
    for (const m of data.members) {
        const row = buildMemberRow(m, srv);
        if (m.online) { onList.appendChild(row); onCount++; }
        else { offList.appendChild(row); offCount++; }
    }
    document.getElementById("online_header").textContent = "ONLINE — " + onCount;
    document.getElementById("offline_header").textContent = "OFFLINE — " + offCount;

    const meAv = document.getElementById("me_av");
    meAv.style.background = getAvatarColor(currentUsername);
    meAv.textContent = currentUsername.charAt(0).toUpperCase();

    loadMessages();
}
async function loadMessages() {
    const res = await fetch("/api/messages");
    if (res.status === 401) { window.location.href = "/"; return; }
    if (!res.ok) return;
    const data = await res.json();

    const box = document.getElementById("chat_messages");
    box.innerHTML = "";
    const filtered = data.messages.filter(m =>
        activeType === "channel"
            ? (m.type === "channel" && (m.server || "hub") === currentServerId && m.to === activeTarget)
            : (m.type === "dm" && ((m.from === currentUsername && m.to === activeTarget) || (m.from === activeTarget && m.to === currentUsername)))
    );

    for (const msg of filtered) {
        const row = document.createElement("div");
        row.className = "msg-row";

        const av = document.createElement("div");
        av.className = "avatar";
        av.style.background = getAvatarColor(msg.from);
        av.textContent = msg.from.charAt(0).toUpperCase();
        row.appendChild(av);

        const body = document.createElement("div");
        const meta = document.createElement("div");
        meta.className = "msg-meta";

        const sender = cachedMembers.find(u => u.username === msg.from);
        const author = document.createElement("span");
        author.className = "msg-author";
        author.textContent = msg.from;
        if (sender && sender.roles.length > 0) author.style.color = sender.roles.color;
        meta.appendChild(author);

        if (sender) {
            if (sender.is_site_admin) {
                const b = document.createElement("span"); b.className = "badge"; b.textContent = "ADMIN"; meta.appendChild(b);
            } else if (sender.is_owner) {
                const b = document.createElement("span"); b.className = "badge"; b.style.background = "#f0b232"; b.textContent = "OWNER"; meta.appendChild(b);
            } else if (sender.is_srv_admin) {
                const b = document.createElement("span"); b.className = "badge"; b.style.background = "#23a55a"; b.textContent = "MOD"; meta.appendChild(b);
            }
            for (const r of sender.roles) {
                const pill = document.createElement("span");
                pill.className = "role-pill"; pill.style.color = r.color; pill.style.borderColor = r.color;
                pill.textContent = r.name; meta.appendChild(pill);
            }
        }
        if (msg.is_bot) {
            const bb = document.createElement("span");
            bb.className = "bot-badge";
            bb.textContent = "BOT";
            meta.appendChild(bb);
        }
   

        const time = document.createElement("span");
        time.className = "msg-time";
        time.textContent = msg.time || "";
        meta.appendChild(time);
        body.appendChild(meta);

        const txt = document.createElement("div");
        txt.className = "msg-text";
        txt.textContent = msg.text;
        body.appendChild(txt);
        row.appendChild(body);

        const canDel = msg.id && (msg.from === currentUsername || isSiteAdmin || (activeType === "channel" && cachedServer && cachedServer.can_delete_messages));
        if (canDel) {
            const delBtn = document.createElement("button");
            delBtn.className = "msg-del-btn";
            delBtn.textContent = "🗑️";
            delBtn.title = "Delete Message";
            delBtn.onclick = async () => {
                await postJson("/api/messages/delete", { id: msg.id });
                loadMessages();
            };
            row.appendChild(delBtn);
        }

        box.appendChild(row);
    }
    box.scrollTop = box.scrollHeight;
}

async function sendMessage() {
    const input = document.getElementById("chat_input");
    const text = input.value.trim();
    if (!text) return;
    await postJson("/api/messages", { type: activeType, server: currentServerId, to: activeTarget, text });
    input.value = "";
    loadMessages();
}

document.getElementById("chat_send").addEventListener("click", sendMessage);
document.getElementById("chat_input").addEventListener("keydown", e => { if (e.key === "Enter") sendMessage(); });

document.getElementById("add_channel_btn").addEventListener("click", async () => {
    const name = await askUser({ title: "Create Text Channel", placeholder: "e.g., announcements" });
    if (name) { await postJson("/api/channels/add", { server: currentServerId, name }); loadState(); }
});

document.getElementById("create_srv_submit").addEventListener("click", async () => {
    const name = document.getElementById("create_srv_name").value.trim();
    if (!name) return;
    const r = await postJson("/api/servers/create", { name });
    const d = await r.json();
    if (!r.ok) { document.getElementById("add_srv_msg").textContent = d.error; return; }
    closeModals();
    switchServer(d.id);
});

document.getElementById("join_srv_submit").addEventListener("click", async () => {
    const invite = document.getElementById("join_srv_code").value.trim();
    if (!invite) return;
    const r = await postJson("/api/servers/join", { invite });
    const d = await r.json();
    if (!r.ok) { document.getElementById("add_srv_msg").textContent = d.error; return; }
    closeModals();
    switchServer(d.id);
});

document.getElementById("user_settings_btn").addEventListener("click", () => {
    const me = cachedMembers.find(u => u.username === currentUsername);
    document.getElementById("set_status").value = (me && me.status) || "";
    document.getElementById("set_color").value = getAvatarColor(currentUsername);
    document.getElementById("set_old_pass").value = "";
    document.getElementById("set_new_pass").value = "";
    document.getElementById("user_set_msg").textContent = "";
    document.getElementById("user_modal").style.display = "flex";
});

document.getElementById("save_user_settings").addEventListener("click", async () => {
    const r = await postJson("/api/me/settings", {
        status: document.getElementById("set_status").value,
        color: document.getElementById("set_color").value,
        old_password: document.getElementById("set_old_pass").value,
        new_password: document.getElementById("set_new_pass").value
    });
    const d = await r.json();
    if (!r.ok) { document.getElementById("user_set_msg").textContent = d.error; return; }
    closeModals();
    loadState();
});

document.getElementById("srv_settings_btn").addEventListener("click", () => {
    switchSrvTab("profile");
    renderServerModal();
    document.getElementById("srv_modal").style.display = "flex";
});

document.getElementById("save_srv_profile").addEventListener("click", async () => {
    await postJson("/api/servers/rename", {
        server: currentServerId,
        name: document.getElementById("set_srv_name").value,
        banner: selectedBanner
    });
    await loadState();
    renderServerModal();
});

document.getElementById("create_role_btn").addEventListener("click", async () => {
    const name = document.getElementById("new_role_name").value;
    const color = document.getElementById("new_role_color").value;
    if (!name) return;
    await postJson("/api/roles/create", { server: currentServerId, name, color });
    document.getElementById("new_role_name").value = "";
    await loadState();
    renderServerModal();
});

document.getElementById("delete_srv_btn").addEventListener("click", async () => {
    const ok = await askUser({
        title: "Delete Server",
        desc: "Are you sure you want to permanently delete this entire server?",
        confirmOnly: true,
        danger: true
    });
    if (!ok) return;
    await postJson("/api/servers/delete", { server: currentServerId });
    closeModals();
    switchServer("hub");
});

document.getElementById("bot_action").addEventListener("change", e => {
    const inp = document.getElementById("bot_action_val");
    inp.style.display = e.target.value === "delete" ? "none" : "block";
    if (e.target.value === "role") inp.placeholder = "Exact role name (e.g., VIP)";
    else if (e.target.value === "dm") inp.placeholder = "Welcome {user}!";
    else inp.placeholder = "Pong! {user} ({args})";
});

document.getElementById("save_bot_btn").addEventListener("click", async () => {
    const name = document.getElementById("bot_name").value.trim();
    const trigger = document.getElementById("bot_trigger").value;
    const trigger_val = document.getElementById("bot_trigger_val").value.trim();
    const action = document.getElementById("bot_action").value;
    const action_val = document.getElementById("bot_action_val").value;
    if (!name || !trigger_val) return;
    await postJson("/api/bots/save", {
        server: currentServerId, name, trigger, trigger_val, action, action_val
    });
    document.getElementById("bot_name").value = "";
    document.getElementById("bot_trigger_val").value = "";
    document.getElementById("bot_action_val").value = "";
    await loadState();
    renderServerModal();
});


async function init() {
    const res = await fetch("/api/me");
    if (!res.ok) { window.location.href = "/"; return; }
    const data = await res.json();
    currentUsername = data.username;
    isSiteAdmin = data.is_site_admin;
    document.title = "DisJS - " + currentUsername;
    document.getElementById("me_label").textContent = currentUsername;
    await loadState();
    setInterval(loadState, 2000);
}

init();
