const ROLE_PERMS = [
    { key: "manage_channels", label: "Manage Channels" },
    { key: "manage_roles", label: "Manage Roles" },
    { key: "delete_messages", label: "Delete Messages" }
];

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
