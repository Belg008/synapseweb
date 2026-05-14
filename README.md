# 🧠 SynapseWeb

**Delte AI-Minne for Agenter**

SynapseWeb er eit interaktivt kunnskapskart som låter AI-agenter og brukarar dele og huske informasjon saman. Tenk det som ein "levande" Wikipedia som veks og endrar seg basert på samtaler.

---

## 🎯 Konsept

- **Start:** Eit tomt kart
- **Undervegs:** Kvar gong du snakkar om noko nytt, blir det automatisk til ein **Node**
- **Struktur:** Noder kan ha **Sub-noder** (hierarki)
- **Deling:** Alle AI-agentar som er kopla til SynapseWeb kan lesa og skriva til same minne

## 🚀 Kom i gang

### 1. Start serveren
```bash
cd /home/sindreb/synapseweb
python3 api_server.py
```
Serveren startar på `http://localhost:8765`

### 2. Opne nettsiden
Gå til `http://localhost:8765` i nettlesaren din.

## 📝 API for AI-Agenter

Agenter kan bruke REST APIet for å lese/skrive minne:

### Legg til node
```bash
curl -X POST http://localhost:8765/api/nodes \
  -H "Content-Type: application/json" \
  -d '{
    "label": "Sindre sin hobby",
    "category": "kunnskap",
    "content": "Sindre likar å kode og spela Minecraft.",
    "tags": "hobby,spel",
    "agent_id": "merlin"
  }'
```

### Hent alle noder
```bash
curl http://localhost:8765/api/nodes
```

### Søk
```bash
curl "http://localhost:8765/api/search?q=sindre"
```

### Stats
```bash
curl http://localhost:8765/api/stats
```

### JavaScript API (i nettlesaren)
```javascript
// Lag ny node
await window.SynapseAPI.createNode(
  "Tittel",
  "Innhold",
  "kunnskap",  // kategori
  "tag1,tag2", // tags
  null,        // parent_id
  "agent-navn" // agent_id
);

// Søk
const results = await window.SynapseAPI.search("nøkkelord");

// Hent statistikk
const stats = await window.SynapseAPI.getStats();
```

## 📁 Kategoriar

| Kategori | Farge | Bruk |
|----------|-------|------|
| 👤 Person | Rosa | Informasjon om folk |
| 🧠 Kunnskap | Grøn | Generell kunnskap |
| 📁 Prosjekt | Oransje | Prosjekt og oppgåver |
| ⭐ Preferanse | Lilla | Preferansar og val |
| 📅 Hending | Raud | Hendingar og event |

## 🌐 WebSocket

Sanntidsoppdateringar via WebSocket på `ws://localhost:8765/ws`.
Alle agenter som er tilkopla får beskjed med ein gong noko endrar seg.

## 💾 Lagring

- **SQLite-database:** `synapseweb.db`
- **Eksporter:** JSON via "Eksporter"-knappen

## ⌨️ Snarvegar

| Tast | Handling |
|------|----------|
| `Ctrl+N` | Ny node |
| `Ctrl+F` | Søk |
| `Escape` | Lukk modal/panel |
| Dobbeltklikk | Zoom til node |

## 🐛 Kjente problem

- Nettlesar-screenshot fungerer ikkje i dette miljøet (Chrome sandbox)
- Men serveren køyrer fint og nettsida er fullt funksjonell

---

**Laga for Merlin 🧠**
