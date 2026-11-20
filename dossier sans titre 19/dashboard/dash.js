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
    rList.innerHTML = "";
    for (const [rName, rColor] of Object.entries(cachedServer.roles)) {
        const chip = document.createElement("div");
        chip.className = "chip";
        chip.style.color = rColor;
        chip.textContent = rName;
        const del = document.createElement("button");
        del.textContent = "✕";
        del.onclick = async () => {
            await postJson("/api/roles/delete", { server: cachedServer.id, name: rName });
            await loadState(); renderServerModal();
        };
        chip.appendChild(del);
        rList.appendChild(chip);
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
    if (m.roles.length > 0) nameSpan.style.color = m.roles[0].color;
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

    if (srv.can_manage || isSiteAdmin) {
        const actions = document.createElement("div");
        actions.className = "admin-actions";
        if (srv.can_manage && Object.keys(srv.roles).length > 0) {
            const rb = document.createElement("button"); rb.textContent = "+Role";
            rb.onclick = async () => {
                const rn = prompt("Toggle role (" + Object.keys(srv.roles).join(", ") + "):");
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
                const p = prompt("New password for " + m.username + ":");
                if (p) await postJson("/api/users/password", { username: m.username, password: p });
            };
            actions.appendChild(pb);
            const db = document.createElement("button"); db.className = "del"; db.textContent = "X";
            db.onclick = async () => { await postJson("/api/users/delete", { username: m.username }); loadState(); };
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
    document.getElementById("add_channel_btn").style.display = srv.can_manage ? "inline" : "none";

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

        // Hover Delete Button (Author, Server Admin/Owner, or Site Admin)
        const canDel = msg.id && (msg.from === currentUsername || isSiteAdmin || (activeType === "channel" && cachedServer && cachedServer.can_manage));
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
    const name = prompt("New channel name:");
    if (name) { await postJson("/api/channels/add", { server: currentServerId, name }); loadState(); }
});

// Create & Join Private Server Handlers
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

// User Settings Handlers
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

// Server Settings Handlers
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
    if (!confirm("Delete this entire server?")) return;
    await postJson("/api/servers/delete", { server: currentServerId });
    closeModals();
    switchServer("hub");
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
