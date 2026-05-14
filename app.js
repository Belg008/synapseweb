/**
 * SYNAPSEWEB - Shared AI Memory Network
 * Interaktivt kunnskapskart for AI-agenter
 * Med API-integrasjon mot FastAPI backend
 */

// === KONFIGURASJON ===
const API_URL = window.location.origin;
const WS_URL = API_URL.replace(/^http/, 'ws') + '/ws';

const CATEGORIES = {
    person: { label: 'Person', color: '#ec4899', icon: '' },
    kunnskap: { label: 'Kunnskap', color: '#10b981', icon: '' },
    prosjekt: { label: 'Prosjekt', color: '#f59e0b', icon: '' },
    preferanse: { label: 'Preferanse', color: '#8b5cf6', icon: '' },
    hending: { label: 'Hending', color: '#ef4444', icon: '' }
};

// === TILSTAND ===
let nodes = new vis.DataSet([]);
let edges = new vis.DataSet([]);
let network = null;
let selectedNode = null;
let currentView = 'network';
let currentFilter = 'all';
let ws = null;

// === INITIALISERING ===
document.addEventListener('DOMContentLoaded', async () => {
    initNetwork();
    setupEventListeners();
    await loadFromAPI();
    connectWebSocket();
});

// === API / LAGRING ===
async function loadFromAPI() {
    try {
        const response = await fetch(`${API_URL}/api/nodes`);
        const apiNodes = await response.json();

        const edgesResponse = await fetch(`${API_URL}/api/edges`);
        const apiEdges = await edgesResponse.json();

        nodes.clear();
        edges.clear();

        // Konverter API-noder til vis.js format
        const visNodes = apiNodes.map(n => ({
            id: n.id,
            label: n.label,
            category: n.category,
            content: n.content,
            tags: n.tags,
            agent_id: n.agent_id,
            date: n.created_at
        }));

        const visEdges = apiEdges.map(e => ({
            id: e.id,
            from: e.from_node,
            to: e.to_node
        }));

        if (visNodes.length === 0) {
            // Legg til demo-data via API
            await addDemoDataViaAPI();
            return;
        }

        nodes.add(visNodes);
        edges.add(visEdges);
        updateNodeColors();
        updateStats();
        updateCategoryCounts();
        checkEmptyState();
        populateParentSelect();
    } catch (e) {
        console.warn('Kunne ikkje kople til API, brukar localStorage:', e);
        loadFromLocalStorage();
    }
}

async function addDemoDataViaAPI() {
    const demo = [
        { label: 'Sindre', category: 'person', content: 'Brukeren heiter Sindre. Liker teknologi, AI og selvhosting.', tags: 'bruker,ai,teknologi' },
        { label: 'Hermes Agent', category: 'kunnskap', content: 'Merlin er AI-assistenten til Sindre. Kjennemerke: Sindre vil bli kalla etter Kingsman-navn.', tags: 'ai,agent,kingsman' },
        { label: 'SynapseWeb', category: 'prosjekt', content: 'Dette prosjektet! Eit delt minne for AI-agenter.', tags: 'prosjekt,minne,web' },
        { label: 'Telegram Gateway', category: 'prosjekt', content: 'Sindre setter opp Telegram-bot for Merlin. BrukerID: 6555932186', tags: 'telegram,bot,gateway' },
        { label: 'Kingsman-navn', category: 'preferanse', content: 'Sindre vil bli kalla Kingsman-navn. Agenten heiter Merlin.', tags: 'navn,kingsman,pref' }
    ];

    const ids = [];
    for (const node of demo) {
        const res = await fetch(`${API_URL}/api/nodes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(node)
        });
        const data = await res.json();
        ids.push(data.data.id);
    }

    // Lag koblingar
    await fetch(`${API_URL}/api/nodes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...demo[1], parent_id: ids[0] })
    });

    await loadFromAPI();
}

function loadFromLocalStorage() {
    const stored = localStorage.getItem('synapseweb_nodes');
    if (stored) {
        const data = JSON.parse(stored);
        if (data.nodes) nodes.add(data.nodes);
        if (data.edges) edges.add(data.edges);
    } else {
        addDemoDataLocal();
    }
    updateNodeColors();
    updateStats();
    updateCategoryCounts();
    checkEmptyState();
    populateParentSelect();
}

function addDemoDataLocal() {
    const demoNodes = [
        { id: 1, label: 'Sindre', category: 'person', content: 'Brukeren heiter Sindre. Liker teknologi, AI og selvhosting.', tags: 'bruker,ai,teknologi', date: new Date().toISOString() },
        { id: 2, label: 'Hermes Agent', category: 'kunnskap', content: 'Merlin er AI-assistenten til Sindre. Kjennemerke: Sindre vil bli kalla etter Kingsman-navn.', tags: 'ai,agent,kingsman', date: new Date().toISOString() },
        { id: 3, label: 'SynapseWeb', category: 'prosjekt', content: 'Dette prosjektet! Eit delt minne for AI-agenter.', tags: 'prosjekt,minne,web', date: new Date().toISOString() },
        { id: 4, label: 'Telegram Gateway', category: 'prosjekt', content: 'Sindre setter opp Telegram-bot for Merlin. BrukerID: 6555932186', tags: 'telegram,bot,gateway', date: new Date().toISOString() },
        { id: 5, label: 'Kingsman-navn', category: 'preferanse', content: 'Sindre vil bli kalla Kingsman-navn. Agenten heiter Merlin.', tags: 'navn,kingsman,pref', date: new Date().toISOString() }
    ];
    const demoEdges = [
        { from: 1, to: 2 }, { from: 1, to: 5 }, { from: 2, to: 3 },
        { from: 2, to: 4 }, { from: 1, to: 4 }
    ];
    nodes.add(demoNodes);
    edges.add(demoEdges);
}

// === WEBSOCKET ===
function connectWebSocket() {
    ws = new WebSocket(WS_URL);

    ws.onopen = () => {
        console.log('WebSocket tilkopla');
    };

    ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        handleWebSocketMessage(msg);
    };

    ws.onclose = () => {
        console.log('WebSocket fråkopla, prøver igjen om 3 sek...');
        setTimeout(connectWebSocket, 3000);
    };

    ws.onerror = (err) => {
        console.warn('WebSocket feil:', err);
    };
}

function handleWebSocketMessage(msg) {
    if (msg.type === 'init') {
        // Full reload
        loadFromAPI();
    } else if (msg.type === 'node_created') {
        const node = msg.data;
        // Ignore nodes created by external agents to avoid unsolicited content
        if (node.agent_id && node.agent_id !== 'web-ui') {
            console.warn('Ignored node from agent:', node.agent_id);
            return;
        }
        nodes.add({
            id: node.id,
            label: node.label,
            category: node.category,
            content: node.content,
            tags: node.tags,
            agent_id: node.agent_id,
            date: node.created_at
        });
        if (node.parent_id) {
            edges.add({ from: node.parent_id, to: node.id });
        }
        updateNodeColors();
        updateStats();
        updateCategoryCounts();
        checkEmptyState();
        populateParentSelect();
    } else if (msg.type === 'node_updated') {
        const node = msg.data;
        nodes.update({
            id: node.id,
            label: node.label,
            category: node.category,
            content: node.content,
            tags: node.tags
        });
        updateNodeColors();
        updateStats();
        updateCategoryCounts();
    } else if (msg.type === 'node_deleted') {
        nodes.remove(msg.data.id);
        const connectedEdges = network.getConnectedEdges(msg.data.id);
        edges.remove(connectedEdges);
        updateStats();
        updateCategoryCounts();
        checkEmptyState();
        populateParentSelect();
    }
}

// === NETTVERK / VISUALISERING ===
function initNetwork() {
    const container = document.getElementById('network-container');

    const options = {
        nodes: {
            shape: 'dot',
            size: 25,
            font: {
                size: 14,
                face: 'Inter',
                color: '#e2e2f0',
                strokeWidth: 3,
                strokeColor: '#0a0a0f'
            },
            borderWidth: 2,
            borderWidthSelected: 4,
            shadow: {
                enabled: true,
                color: 'rgba(0,0,0,0.3)',
                size: 10,
                x: 0,
                y: 4
            }
        },
        edges: {
            width: 2,
            color: {
                color: '#2a2a3e',
                highlight: '#6366f1',
                hover: '#818cf8'
            },
            smooth: {
                type: 'continuous',
                roundness: 0.2
            },
            arrows: {
                to: { enabled: true, scaleFactor: 0.5 }
            }
        },
        physics: {
            forceAtlas2Based: {
                gravitationalConstant: -60,
                centralGravity: 0.005,
                springLength: 200,
                springConstant: 0.08,
                damping: 0.4,
                avoidOverlap: 0.5
            },
            maxVelocity: 50,
            solver: 'forceAtlas2Based',
            timestep: 0.35,
            stabilization: { iterations: 150 }
        },
        interaction: {
            hover: true,
            tooltipDelay: 200,
            multiselect: false,
            navigationButtons: false,
            keyboard: false
        },
        layout: {
            improvedLayout: true
        }
    };

    network = new vis.Network(container, { nodes, edges }, options);

    network.on('click', (params) => {
        if (params.nodes.length > 0) {
            showNodeDetail(params.nodes[0]);
        } else {
            closeDetailPanel();
        }
    });

    network.on('hoverNode', () => {
        container.style.cursor = 'pointer';
    });

    network.on('blurNode', () => {
        container.style.cursor = 'default';
    });

    network.on('doubleClick', (params) => {
        if (params.nodes.length > 0) {
            network.focus(params.nodes[0], {
                scale: 1.2,
                animation: { duration: 500, easingFunction: 'easeInOutQuad' }
            });
        }
    });
}

function updateNodeColors() {
    const allNodes = nodes.get();
    const updates = allNodes.map(node => {
        const cat = CATEGORIES[node.category] || CATEGORIES.kunnskap;
        return {
            id: node.id,
            color: {
                background: cat.color,
                border: cat.color,
                highlight: { background: cat.color, border: '#ffffff' },
                hover: { background: cat.color, border: '#ffffff' }
            }
        };
    });
    nodes.update(updates);
}

function switchView(view) {
    currentView = view;
    const options = view === 'hierarchical' ? {
        layout: {
            hierarchical: {
                enabled: true,
                direction: 'UD',
                sortMethod: 'directed',
                levelSeparation: 150,
                nodeSpacing: 200
            }
        },
        physics: { enabled: false }
    } : {
        layout: { hierarchical: false },
        physics: {
            forceAtlas2Based: {
                gravitationalConstant: -60,
                centralGravity: 0.005,
                springLength: 200,
                springConstant: 0.08,
                damping: 0.4,
                avoidOverlap: 0.5
            },
            maxVelocity: 50,
            solver: 'forceAtlas2Based',
            timestep: 0.35,
            stabilization: { iterations: 150 }
        }
    };
    network.setOptions(options);
}

function filterByCategory(category) {
    currentFilter = category;
    const allNodes = nodes.get();

    if (category === 'all') {
        const updates = allNodes.map(n => ({ id: n.id, hidden: false }));
        nodes.update(updates);
    } else {
        const updates = allNodes.map(n => ({
            id: n.id,
            hidden: n.category !== category
        }));
        nodes.update(updates);
    }

    document.querySelectorAll('.category-item').forEach(el => {
        el.classList.toggle('active', el.dataset.category === category);
    });
}

// === NODE-DETALJ PANEL ===
function showNodeDetail(nodeId) {
    const node = nodes.get(nodeId);
    if (!node) return;

    selectedNode = nodeId;
    const cat = CATEGORIES[node.category] || CATEGORIES.kunnskap;
    const date = node.date ? new Date(node.date).toLocaleString('no-NO') : 'Ukjent';
    const agent = node.agent_id || 'Ukjent agent';

    const connectedIds = network.getConnectedNodes(nodeId);
    const connected = connectedIds.map(id => {
        const n = nodes.get(id);
        if (!n) return null;
        const c = CATEGORIES[n.category] || CATEGORIES.kunnskap;
        return { id: n.id, label: n.label, color: c.color };
    }).filter(Boolean);

    const tags = node.tags ? node.tags.split(',').map(t => t.trim()).filter(Boolean) : [];

    document.getElementById('detail-content').innerHTML = `
        <div class="node-detail">
            <div class="detail-category" style="background: ${cat.color}22; color: ${cat.color}; border: 1px solid ${cat.color}44;">
                ${cat.icon} ${cat.label}
            </div>
            <h2 class="detail-title">${escapeHtml(node.label)}</h2>
            <div class="detail-date">Agent: ${escapeHtml(agent)} · ${date}</div>
            <div class="detail-content">${escapeHtml(node.content || 'Ingen innhald.')}</div>
            ${tags.length > 0 ? `
                <div class="detail-tags">
                    ${tags.map(t => `<span class="detail-tag">#${escapeHtml(t)}</span>`).join('')}
                </div>
            ` : ''}
            ${connected.length > 0 ? `
                <div class="detail-connections">
                    <h4>Kobla til (${connected.length})</h4>
                    ${connected.map(c => `
                        <div class="connection-item" data-id="${c.id}">
                            <span class="connection-dot" style="background: ${c.color};"></span>
                            <span class="connection-name">${escapeHtml(c.label)}</span>
                        </div>
                    `).join('')}
                </div>
            ` : ''}
            <div class="detail-actions">
                <button class="btn btn-primary" onclick="editNode(${node.id})">✏️ Rediger</button>
                <button class="btn btn-secondary" onclick="addSubNode(${node.id})">Legg til subnode</button>
                <button class="btn btn-secondary" style="color: var(--danger); border-color: var(--danger);" onclick="deleteNode(${node.id})">🗑️ Slett</button>
            </div>
        </div>
    `;

    document.querySelectorAll('.connection-item').forEach(el => {
        el.addEventListener('click', () => {
            const id = parseInt(el.dataset.id);
            network.selectNodes([id]);
            showNodeDetail(id);
            network.focus(id, { animation: true });
        });
    });

    const detailPanelEl = document.getElementById('detail-panel');
    // Limit panel width so it doesn't cover the whole viewport on small screens
    detailPanelEl.style.width = 'min(420px, 38vw)';
    detailPanelEl.classList.add('open');
}

function closeDetailPanel() {
    const detailPanelEl = document.getElementById('detail-panel');
    detailPanelEl.classList.remove('open');
    detailPanelEl.style.width = '';
    selectedNode = null;
    network.unselectAll();
}

// === NODE-HÅNDTERING ===
async function addNode(data) {
    const response = await fetch(`${API_URL}/api/nodes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            label: data.title,
            category: data.category,
            content: data.content,
            tags: data.tags,
            parent_id: data.parent ? parseInt(data.parent) : null,
            agent_id: data.agent_id || 'web-ui'
        })
    });
    const result = await response.json();
    return result.data?.id || result.id;
}

function addSubNode(parentId) {
    document.getElementById('node-parent').value = parentId;
    openModal();
}

async function editNode(id) {
    const node = nodes.get(id);
    if (!node) return;

    document.getElementById('node-title').value = node.label;
    document.getElementById('node-category').value = node.category;
    document.getElementById('node-content').value = node.content || '';
    document.getElementById('node-tags').value = node.tags || '';
    document.getElementById('node-parent').value = '';

    const saveBtn = document.getElementById('save-node');
    saveBtn.textContent = '💾 Oppdater';
    saveBtn.onclick = async () => {
        await fetch(`${API_URL}/api/nodes/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                label: document.getElementById('node-title').value,
                category: document.getElementById('node-category').value,
                content: document.getElementById('node-content').value,
                tags: document.getElementById('node-tags').value
            })
        });

        updateNodeColors();
        updateStats();
        updateCategoryCounts();
        closeModal();
        showNodeDetail(id);

        saveBtn.textContent = '💾 Lagre';
        saveBtn.onclick = handleSaveNode;
    };

    openModal();
}

async function deleteNode(id) {
    if (!confirm('Er du sikker på at du vil slette denne noden?')) return;

    await fetch(`${API_URL}/api/nodes/${id}`, { method: 'DELETE' });

    closeDetailPanel();
    updateStats();
    updateCategoryCounts();
    checkEmptyState();
    populateParentSelect();
}

// === MODAL ===
function openModal() {
    document.getElementById('add-modal').classList.add('show');
    document.getElementById('node-title').focus();
}

function closeModal() {
    document.getElementById('add-modal').classList.remove('show');
    document.getElementById('node-title').value = '';
    document.getElementById('node-category').value = 'person';
    document.getElementById('node-content').value = '';
    document.getElementById('node-tags').value = '';
    document.getElementById('node-parent').value = '';

    const saveBtn = document.getElementById('save-node');
    saveBtn.textContent = '💾 Lagre';
    saveBtn.onclick = handleSaveNode;
}

async function handleSaveNode() {
    const title = document.getElementById('node-title').value.trim();
    if (!title) {
        alert('Du må skrive ein tittel!');
        return;
    }

    const id = await addNode({
        title,
        category: document.getElementById('node-category').value,
        content: document.getElementById('node-content').value.trim(),
        tags: document.getElementById('node-tags').value.trim(),
        parent: document.getElementById('node-parent').value
    });

    closeModal();

    setTimeout(() => {
        if (id) {
            network.selectNodes([id]);
            showNodeDetail(id);
            network.focus(id, { animation: true, scale: 1.2 });
        }
    }, 300);
}

function populateParentSelect() {
    const select = document.getElementById('node-parent');
    const currentVal = select.value;
    select.innerHTML = '<option value="">Ingen (hovednode)</option>';

    const allNodes = nodes.get();
    allNodes.forEach(node => {
        const option = document.createElement('option');
        option.value = node.id;
        option.textContent = node.label;
        select.appendChild(option);
    });

    if (currentVal) select.value = currentVal;
}

// === STATISTIKK ===
async function updateStats() {
    try {
        const res = await fetch(`${API_URL}/api/stats`);
        const stats = await res.json();
        document.getElementById('node-count').textContent = stats.total_nodes;
        document.getElementById('connection-count').textContent = stats.total_edges;
        document.getElementById('agent-count').textContent = stats.agents;
    } catch (e) {
        document.getElementById('node-count').textContent = nodes.length;
        document.getElementById('connection-count').textContent = edges.length;
        document.getElementById('agent-count').textContent = '1';
    }
}

function updateCategoryCounts() {
    const counts = {};
    Object.keys(CATEGORIES).forEach(c => counts[c] = 0);
    counts.all = nodes.length;

    nodes.forEach(node => {
        if (counts[node.category] !== undefined) {
            counts[node.category]++;
        }
    });

    Object.keys(counts).forEach(cat => {
        const el = document.getElementById(`count-${cat}`);
        if (el) el.textContent = counts[cat];
    });
}

function checkEmptyState() {
    const emptyState = document.getElementById('empty-state');
    if (nodes.length === 0) {
        emptyState.classList.add('show');
    } else {
        emptyState.classList.remove('show');
    }
}

// === SØK ===
async function searchNodes(query) {
    const results = document.getElementById('search-results');
    if (!query.trim()) {
        results.innerHTML = '';
        return;
    }

    try {
        const res = await fetch(`${API_URL}/api/search?q=${encodeURIComponent(query)}`);
        const matches = await res.json();

        if (matches.length === 0) {
            results.innerHTML = '<div class="search-result"><span style="color: var(--text-muted);">Ingen treff</span></div>';
            return;
        }

        results.innerHTML = matches.slice(0, 5).map(node => {
            const cat = CATEGORIES[node.category] || CATEGORIES.kunnskap;
            return `
                <div class="search-result" data-id="${node.id}">
                    <div class="search-result-title">${escapeHtml(node.label)}</div>
                    <div class="search-result-category">${cat.icon} ${cat.label}</div>
                </div>
            `;
        }).join('');

        document.querySelectorAll('.search-result[data-id]').forEach(el => {
            el.addEventListener('click', () => {
                const id = parseInt(el.dataset.id);
                network.selectNodes([id]);
                showNodeDetail(id);
                network.focus(id, { animation: true, scale: 1.2 });
            });
        });
    } catch (e) {
        // Fallback til lokal søk
        const lower = query.toLowerCase();
        const matches = nodes.get().filter(node =>
            node.label.toLowerCase().includes(lower) ||
            (node.content && node.content.toLowerCase().includes(lower)) ||
            (node.tags && node.tags.toLowerCase().includes(lower))
        );

        results.innerHTML = matches.slice(0, 5).map(node => {
            const cat = CATEGORIES[node.category] || CATEGORIES.kunnskap;
            return `
                <div class="search-result" data-id="${node.id}">
                    <div class="search-result-title">${escapeHtml(node.label)}</div>
                    <div class="search-result-category">${cat.icon} ${cat.label}</div>
                </div>
            `;
        }).join('');
    }
}

// === EVENT LISTENERS ===
function setupEventListeners() {
    document.getElementById('add-node-btn').addEventListener('click', openModal);
    document.getElementById('empty-add-btn').addEventListener('click', openModal);

    document.getElementById('close-modal').addEventListener('click', closeModal);
    document.getElementById('cancel-add').addEventListener('click', closeModal);
    document.getElementById('save-node').addEventListener('click', handleSaveNode);

    document.getElementById('add-modal').addEventListener('click', (e) => {
        if (e.target.id === 'add-modal') closeModal();
    });

    document.getElementById('close-detail').addEventListener('click', closeDetailPanel);

    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            switchView(btn.dataset.view);
        });
    });

    document.querySelectorAll('.category-item').forEach(item => {
        item.addEventListener('click', () => {
            filterByCategory(item.dataset.category);
        });
    });

    document.getElementById('search-input').addEventListener('input', (e) => {
        searchNodes(e.target.value);
    });

    document.getElementById('reset-view-btn').addEventListener('click', () => {
        network.fit({ animation: true });
    });

    document.getElementById('fit-btn').addEventListener('click', () => {
        if (selectedNode) {
            network.focus(selectedNode, { animation: true, scale: 1.2 });
        } else {
            network.fit({ animation: true });
        }
    });

    document.getElementById('export-btn').addEventListener('click', exportData);

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeModal();
            closeDetailPanel();
        }
        if (e.ctrlKey && e.key === 'n') {
            e.preventDefault();
            openModal();
        }
        if (e.ctrlKey && e.key === 'f') {
            e.preventDefault();
            document.getElementById('search-input').focus();
        }
    });
}

// === EKSPORT ===
async function exportData() {
    try {
        const res = await fetch(`${API_URL}/api/nodes`);
        const apiNodes = await res.json();
        const edgesRes = await fetch(`${API_URL}/api/edges`);
        const apiEdges = await edgesRes.json();

        const data = {
            nodes: apiNodes,
            edges: apiEdges,
            exported_at: new Date().toISOString(),
            version: '1.0'
        };

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `synapseweb_export_${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    } catch (e) {
        alert('Kunne ikkje eksportere: ' + e.message);
    }
}

// === GLOBALT API FOR AGENTER ===
window.SynapseAPI = {
    createNode: async (title, content, category = 'kunnskap', tags = '', parentId = null, agentId = 'agent') => {
        // Block agent-driven node creation via the browser API by default to avoid unsolicited nodes
        if (agentId && agentId !== 'web-ui') {
            console.warn('Blocked SynapseAPI.createNode from agent:', agentId);
            return { error: 'agent_node_creation_blocked' };
        }
        const res = await fetch(`${API_URL}/api/nodes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ label: title, content, category, tags, parent_id: parentId, agent_id: agentId })
        });
        return await res.json();
    },

    getNodes: async () => {
        const res = await fetch(`${API_URL}/api/nodes`);
        return await res.json();
    },

    getNode: async (id) => {
        const res = await fetch(`${API_URL}/api/nodes/${id}`);
        return await res.json();
    },

    search: async (query) => {
        const res = await fetch(`${API_URL}/api/search?q=${encodeURIComponent(query)}`);
        return await res.json();
    },

    getStats: async () => {
        const res = await fetch(`${API_URL}/api/stats`);
        return await res.json();
    },

    updateNode: async (id, data) => {
        const res = await fetch(`${API_URL}/api/nodes/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        return await res.json();
    },

    deleteNode: async (id) => {
        const res = await fetch(`${API_URL}/api/nodes/${id}`, { method: 'DELETE' });
        return await res.json();
    },

    export: exportData,

    onUpdate: (callback) => {
        const originalHandler = ws.onmessage;
        ws.onmessage = (event) => {
            const msg = JSON.parse(event.data);
            callback(msg);
            if (originalHandler) originalHandler(event);
        };
    }
};

// === HJELPEFUNKSJONAR ===
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// === KONSOLL-BESKJED ===
console.log('%cSynapseWeb lasta!', 'color: #6366f1; font-size: 16px; font-weight: bold;');
console.log('%cAPI-endepunkt: ' + API_URL, 'color: #a0a0b8;');
console.log('%cBruk window.SynapseAPI for å interagere programmatisk.', 'color: #a0a0b8;');
