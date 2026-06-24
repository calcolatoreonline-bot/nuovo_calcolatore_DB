/* ══════════════════════════════════════════════════════════════════════════════
   DASHBOARD NUTRIZIONE ELITE - app.js v5.0 (RUBRICA MODALE & FIX INIEZIONE DATI)
══════════════════════════════════════════════════════════════════════════════ */

const targetUrl = 'https://ympbqcmbhnjerjqxgska.supabase.co';
const targetKey = 'sb_publishable_8bs12qrDkQmPi4pOQTMQyg_ef9r5-KW';

let sbClient = null;

try {
  if (window.supabase && typeof window.supabase.createClient === 'function') {
    sbClient = window.supabase.createClient(targetUrl, targetKey);
    console.log('✅ Supabase connesso con successo.');
  }
} catch (err) {
  console.error('❌ Errore Database Supabase:', err);
}

const FILES = {
  logo:   'logo_de_salvo_transparent.png',
  silM:   'Siluette_Uomo.jpeg',
  silF:   'Siluette_Donna.jpeg',
  eliteM: 'COMPOSIZIONE CORPOREA UOMO.JPEG',
  eliteF: 'COMPOSIZIONE CORPOREA DONNA.JPEG',
};

let currentPatient = null;
let currentVisitId = null;
let cachedVisitsList = []; // Tiene traccia dello storico visite del paziente attivo
let allPatientsCache = []; // Cella di memoria per archiviare tutti i pazienti della rubrica

// Istanze globali ChartJS per distruzione sicura su aggiornamenti
let chartPeso = null, chartComp = null, chartCirc = null, chartPliche = null;

document.addEventListener('DOMContentLoaded', () => {
  initEventListeners();
  window.addEventListener('resize', gestisciAnteprimaMobile);
});

function initEventListeners() {
  document.getElementById('btn-open-modal')?.addEventListener('click', () => document.getElementById('modal-paziente')?.classList.remove('hidden'));
  document.getElementById('btn-close-modal')?.addEventListener('click', chiudiModale);
  document.getElementById('btn-close-modal-cancel')?.addEventListener('click', chiudiModale);
  document.getElementById('modal-overlay')?.addEventListener('click', chiudiModale);
  document.getElementById('btn-registra-paziente')?.addEventListener('click', registraPaziente);
  
  // Gestione apertura e chiusura Rubrica Grande Banner
  document.getElementById('patient-search')?.addEventListener('click', apriRubricaBanner);
  document.getElementById('btn-close-rubrica')?.addEventListener('click', chiudiRubricaBanner);
  document.getElementById('rubrica-search-input')?.addEventListener('input', filtraPazientiInRubrica);

  document.getElementById('btn-salva-visita')?.addEventListener('click', salvaVisita);
  document.getElementById('btn-calcola-report')?.addEventListener('click', elaboraAnteprimaReport);
  document.getElementById('btn-pdf')?.addEventListener('click', scaricaPDF);
  
  document.getElementById('select-visita-storica')?.addEventListener('change', (e) => {
    if (e.target.value === 'new') {
      document.getElementById('form-valutazione').reset();
      document.getElementById('in-laf').value = '1.375';
      currentVisitId = null;
      autoCompilaEtaIniziale(); // Auto-iniezione intelligente dell'età
    } else {
      currentVisitId = e.target.value;
      caricaDatiVisitaSingola(currentVisitId);
    }
  });
}

function chiudiModale() {
  document.getElementById('modal-paziente')?.classList.add('hidden');
  document.getElementById('new-nominativo').value = '';
  document.getElementById('new-sesso').value = '';
  document.getElementById('new-nascita').value = '';
}

/* 📥 LOGICA RUBRICA ESTESA DI SELEZIONE */
async function apriRubricaBanner() {
  document.getElementById('banner-rubrica').classList.remove('hidden');
  document.getElementById('rubrica-search-input').value = '';
  document.getElementById('rubrica-search-input').focus();
  if (!sbClient) return;

  try {
    const { data, error } = await sbClient.from('pazienti').select('*').order('nominativo', { ascending: true });
    if (error) throw error;
    allPatientsCache = data;
    renderListaPazientiRubrica(allPatientsCache);
  } catch (err) {
    console.error('Errore scaricamento rubrica:', err);
  }
}

function chiudiRubricaBanner() {
  document.getElementById('banner-rubrica').classList.add('hidden');
}

function renderListaPazientiRubrica(lista) {
  const container = document.getElementById('rubrica-patients-container');
  if (lista.length === 0) {
    container.innerHTML = `<div class="rubrica-empty">Nessun paziente trovato corrispondente ai criteri di ricerca.</div>`;
    return;
  }

  container.innerHTML = lista.map(p => {
    const dataNascitaF = p.data_nascita ? new Date(p.data_nascita).toLocaleDateString('it-IT') : 'Non inserita';
    return `
      <div class="rubrica-patient-card" data-id="${p.id}" data-name="${p.nominativo}" data-gender="${p.sesso}" data-birth="${p.data_nascita || ''}">
        <div class="rpc-avatar ${p.sesso.toLowerCase()}">${p.sesso}</div>
        <div class="rpc-details">
          <h4>${p.nominativo}</h4>
          <p>Nato/a il: <strong>${dataNascitaF}</strong></p>
        </div>
      </div>
    `;
  }).join('');

  // Binding click selezione
  container.querySelectorAll('.rubrica-patient-card').forEach(card => {
    card.addEventListener('click', function() {
      selezionaPaziente(
        this.getAttribute('data-id'),
        this.getAttribute('data-name'),
        this.getAttribute('data-gender'),
        this.getAttribute('data-birth')
      );
      chiudiRubricaBanner();
    });
  });
}

function filtraPazientiInRubrica(e) {
  const query = e.target.value.toUpperCase().trim();
  if (!query) {
    renderListaPazientiRubrica(allPatientsCache);
    return;
  }
  const filtrati = allPatientsCache.filter(p => p.nominativo.toUpperCase().includes(query));
  renderListaPazientiRubrica(filtrati);
}

function gestisciAnteprimaMobile() {
  if (window.innerWidth > 820) {
    document.querySelectorAll('.pg-wrap').forEach(el => el.style.transform = 'none');
    document.querySelectorAll('.pg-container-mobile').forEach(el => el.style.height = 'auto');
    return;
  }
  const larghezzaSchermo = window.innerWidth - 20; 
  const fattoreScala = larghezzaSchermo / 794;
  const altezzaScalata = 1123 * fattoreScala;

  document.querySelectorAll('.pg-wrap').forEach(el => el.style.transform = `scale(${fattoreScala})`);
  document.querySelectorAll('.pg-container-mobile').forEach(el => el.style.height = `${altezzaScalata}px`);
}

async function registraPaziente() {
  const nom = document.getElementById('new-nominativo').value.toUpperCase().trim();
  const sesso = document.getElementById('new-sesso').value;
  const nascita = document.getElementById('new-nascita').value || null;

  if (!nom || !sesso) { alert('⚠️ Campi obbligatori mancanti.'); return; }
  if (!sbClient) return;

  try {
    const { data, error } = await sbClient.from('pazienti').insert([{ nominativo: nom, sesso, data_nascita: nascita }]).select();
    if (error) throw error;
    chiudiModale();
    selezionaPaziente(data[0].id, data[0].nominativo, data[0].sesso, data[0].data_nascita);
  } catch (err) { alert(err.message); }
}

async function selezionaPaziente(id, nominativo, sesso, data_nascita) {
  currentPatient = { id, nominativo, sesso, data_nascita };
  document.getElementById('current-patient-name').textContent = nominativo;
  
  const badge = document.getElementById('patient-gender-badge');
  badge.textContent = sesso === 'M' ? '👨 Uomo' : '👩 Donna';
  badge.className = `gender-badge ${sesso === 'M' ? 'm' : 'f'}`;
  
  document.getElementById('in-nominativo').value = nominativo;
  document.getElementById('in-sesso').value = sesso;

  aggiornaFormUI(sesso);
  await caricaStoricoVisite(id);
  
  // Setta lo stato su Nuova Visita predefinita e autocompila l'età storica/anagrafica
  document.getElementById('select-visita-storica').value = 'new';
  document.getElementById('form-valutazione').reset();
  document.getElementById('in-laf').value = '1.375';
  currentVisitId = null;
  autoCompilaEtaIniziale();
}

/* 🧠 AUTOCOMPILAZIONE INTELLIGENTE ETÀ */
function autoCompilaEtaIniziale() {
  if (!currentPatient) return;
  
  // 1. Se presente la data di nascita, calcola l'età esatta per l'anno corrente (2026)
  if (currentPatient.data_nascita) {
    const dataNascita = new Date(currentPatient.data_nascita);
    let etaCalcolata = 2026 - dataNascita.getFullYear();
    document.getElementById('in-eta').value = etaCalcolata;
    return;
  }

  // 2. Fallback: Se non c'è la data di nascita, recupera il dato inserito storicamente nella prima o ultima visita
  if (cachedVisitsList && cachedVisitsList.length > 0) {
    const ultimaVisitaConEta = [...cachedVisitsList].reverse().find(v => v.eta && v.eta > 0);
    if (ultimaVisitaConEta) {
      document.getElementById('in-eta').value = ultimaVisitaConEta.eta;
    }
  }
}

function aggiornaFormUI(sesso) {
  const contAntro = document.getElementById('cont-antro');
  const contPliche = document.getElementById('cont-pliche');

  if (sesso === 'M') {
    contAntro.innerHTML = `
      <div class="form-group"><label>Collo (cm)</label><input type="number" id="c-collo" step="0.1" placeholder="38"></div>
      <div class="form-group"><label>Torace (cm)</label><input type="number" id="c-torace" step="0.1" placeholder="102"></div>
      <div class="form-group"><label>Vita (cm)</label><input type="number" id="c-vita" step="0.1" placeholder="88"></div>
      <div class="form-group"><label>Fianchi (cm)</label><input type="number" id="c-fianchi" step="0.1" placeholder="96"></div>
      <div class="form-group"><label>Braccio Ril. (cm)</label><input type="number" id="c-braccio-ril" step="0.1" placeholder="32"></div>
      <div class="form-group"><label>Braccio Con. (cm)</label><input type="number" id="c-braccio-con" step="0.1" placeholder="35"></div>
      <div class="form-group"><label>Coscia (cm)</label><input type="number" id="c-coscia" step="0.1" placeholder="58"></div>
    `;
    const pM = ['Pettorale', 'Ascellare', 'Addome', 'Soprailiaca', 'Tricipitale', 'Sottoscapolare', 'Coscia'];
    contPliche.innerHTML = pM.map(p => `
      <div class="form-group"><label>${p} (mm)</label><input type="number" id="p-${p.toLowerCase()}" step="0.1" placeholder="10"></div>
    `).join('');
  } else {
    contAntro.innerHTML = `
      <div class="form-group"><label>Collo (cm)</label><input type="number" id="c-collo" step="0.1" placeholder="34"></div>
      <div class="form-group"><label>Vita (cm)</label><input type="number" id="c-vita" step="0.1" placeholder="68"></div>
      <div class="form-group"><label>Fianchi (cm)</label><input type="number" id="c-fianchi" step="0.1" placeholder="92"></div>
      <div class="form-group"><label>Gluteo (cm)</label><input type="number" id="c-gluteo" step="0.1" placeholder="96"></div>
      <div class="form-group"><label>Braccio Ril. (cm)</label><input type="number" id="c-braccio-ril" step="0.1" placeholder="27"></div>
      <div class="form-group"><label>Braccio Con. (cm)</label><input type="number" id="c-braccio-con" step="0.1" placeholder="29"></div>
      <div class="form-group"><label>Coscia (cm)</label><input type="number" id="c-coscia" step="0.1" placeholder="54"></div>
    `;
    const pF = ['Addome', 'Soprailiaca', 'Tricipitale', 'Sottoscapolare', 'Coscia'];
    contPliche.innerHTML = pF.map(p => `
      <div class="form-group"><label>${p} (mm)</label><input type="number" id="p-${p.toLowerCase()}" step="0.1" placeholder="12"></div>
    `).join('');
  }
}

async function caricaStoricoVisite(pazienteId) {
  if (!sbClient) return;
  try {
    const { data, error } = await sbClient.from('visite').select('*').eq('paziente_id', pacienteId).order('data_visita', { ascending: true });
    if (error) throw error;

    cachedVisitsList = data; // Popolamento cache per autocompilazione età
    const select = document.getElementById('select-visita-storica');
    select.innerHTML = '<option value="new">➕ Nuova Visita (Oggi)</option>';
    data.forEach(v => {
      const dataF = new Date(v.data_visita).toLocaleDateString('it-IT');
      select.innerHTML += `<option value="${v.id}">Visita del ${dataF} (${v.peso} kg)</option>`;
    });

    renderingGraficiElite(data);
  } catch (err) { console.error(err); }
}

/* 📊 RENDERING GRAFICI PREMIUM RIGIDI DA SCREENSHOT */
function renderingGraficiElite(visite) {
  if (visite.length === 0) return;
  const labels = visite.map(v => new Date(v.data_visita).toLocaleDateString('it-IT'));
  
  // Opzioni grafiche condivise per mimare lo stile premium moderno (Smooth, Filled & clean grids)
  const opzioniGraficoComuni = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: true, labels: { boxWidth: 12, font: { size: 11, weight: '600' } } } },
    scales: {
      x: { grid: { display: false } },
      y: { grid: { color: '#e2e8f0', drawBorder: false } }
    },
    elements: {
      line: { tension: 0.38, borderWidth: 3 },
      point: { radius: 4, hoverRadius: 6, backgroundColor: '#ffffff', borderWidth: 2 }
    }
  };

  // 1. GRAFICO PESO
  if (chartPeso) chartPeso.destroy();
  chartPeso = new Chart(document.getElementById('chart-peso').getContext('2d'), {
    type: 'line',
    data: { 
      labels, 
      datasets: [{ 
        label: 'Peso (kg)', 
        data: visite.map(v => v.peso), 
        borderColor: '#1e40af', 
        backgroundColor: 'rgba(30, 64, 175, 0.06)',
        fill: true 
      }] 
    },
    options: opzioniGraficoComuni
  });

  // 2. GRAFICO COMPOSIZIONE CORPOREA DINAMICA
  const fmData = []; const ffmData = [];
  visite.forEach(v => {
    const s = currentPatient.sesso;
    const eta = v.eta || 30;
    let somma = s === 'M' 
      ? (v.p_pettorale||0)+(v.p_ascellare||0)+(v.p_addome||0)+(v.p_soprailiaca||0)+(v.p_tricipitale||0)+(v.p_sottoscapolare||0)+(v.p_coscia||0)
      : (v.p_addome||0)+(v.p_soprailiaca||0)+(v.p_tricipitale||0)+(v.p_sottoscapolare||0)+(v.p_coscia||0);
    
    if (somma > 0) {
      let bd = s === 'M'
        ? 1.112 - (0.00043499 * somma) + (0.00000055 * somma * somma) - (0.00028826 * eta)
        : 1.0994921 - (0.0009929 * somma) + (0.0000023 * somma * somma) - (0.0001392 * eta);
      let fm = (495 / bd) - 450;
      fmData.push(Math.round(fm * 10) / 10);
      ffmData.push(Math.round((100 - fm) * 10) / 10);
    } else { fmData.push(null); ffmData.push(null); }
  });

  if (chartComp) chartComp.destroy();
  chartComp = new Chart(document.getElementById('chart-composizione').getContext('2d'), {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Massa Grassa % (FM)', data: fmData, borderColor: '#dc2626', backgroundColor: 'rgba(220, 38, 38, 0.04)', fill: true },
        { label: 'Massa Magra % (FFM)', data: ffmData, borderColor: '#059669', backgroundColor: 'rgba(5, 150, 105, 0.04)', fill: true }
      ]
    },
    options: opzioniGraficoComuni
  });

  // 3. GRAFICO CIRCONFERENZE
  if (chartCirc) chartCirc.destroy();
  chartCirc = new Chart(document.getElementById('chart-circonferenze').getContext('2d'), {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Vita (cm)', data: visite.map(v => v.c_vita), borderColor: '#2563eb', fill: false },
        { label: 'Fianchi (cm)', data: visite.map(v => v.c_fianchi), borderColor: '#7c3aed', fill: false },
        { label: 'Braccio Ril. (cm)', data: visite.map(v => v.c_braccio), borderColor: '#f59e0b', fill: false }
      ]
    },
    options: opzioniGraficoComuni
  });

  // 4. GRAFICO PLICHE CUTANEE
  if (chartPliche) chartPliche.destroy();
  chartPliche = new Chart(document.getElementById('chart-pliche-trend').getContext('2d'), {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Addome (mm)', data: visite.map(v => v.p_addome), borderColor: '#ea580c', fill: false },
        { label: 'Tricipitale (mm)', data: visite.map(v => v.p_tricipitale), borderColor: '#16a34a', fill: false },
        { label: 'Coscia (mm)', data: visite.map(v => v.p_coscia), borderColor: '#db2777', fill: false }
      ]
    },
    options: opzioniGraficoComuni
  });
}

const n = id => parseFloat(document.getElementById(id)?.value) || 0;

async function salvaVisita() {
  if (!currentPatient) { alert('⚠️ Seleziona un paziente attivo.'); return; }

  const payload = {
    paziente_id: currentPatient.id,
    eta: n('in-eta'),
    peso: n('in-peso'),
    altezza: n('in-altezza'),
    laf: n('in-laf'),
    c_collo: n('c-collo'),
    c_torace: document.getElementById('c-torace') ? n('c-torace') : null,
    c_vita: n('c-vita'),
    c_fianchi: n('c-fianchi'),
    c_gluteo: document.getElementById('c-gluteo') ? n('c-gluteo') : null,
    c_braccio: n('c-braccio-ril'), 
    c_braccio_contratto: n('c-braccio-con'), 
    c_coscia: n('c-coscia'),
    p_pettorale: document.getElementById('p-pettorale') ? n('p-pettorale') : null,
    p_ascellare: document.getElementById('p-ascellare') ? n('p-ascellare') : null,
    p_addome: n('p-addome'),
    p_soprailiaca: n('p-soprailiaca'),
    p_tricipitale: n('p-tricipitale'),
    p_sottoscapolare: n('p-sottoscapolare'),
    p_coscia: n('p-coscia'),
    data_visita: new Date().toISOString().split('T')[0]
  };

  if (!sbClient) return;
  try {
    let res = currentVisitId 
      ? await sbClient.from('visite').update(payload).eq('id', currentVisitId).select()
      : await sbClient.from('visite').insert([payload]).select();

    if (res.error) throw res.error;
    alert('✅ Visita salvata con successo.');
    await caricaStoricoVisite(currentPatient.id);
  } catch (err) { alert(err.message); }
}

async function caricaDatiVisitaSingola(id) {
  if (!sbClient) return;
  try {
    const { data, error } = await sbClient.from('visite').select('*').eq('id', id).single();
    if (error) throw error;

    document.getElementById('in-eta').value = data.eta || '';
    document.getElementById('in-peso').value = data.peso || '';
    document.getElementById('in-altezza').value = data.altezza || '';
    document.getElementById('in-laf').value = data.laf || '1.375';

    if (document.getElementById('c-collo')) document.getElementById('c-collo').value = data.c_collo || '';
    if (document.getElementById('c-torace')) document.getElementById('c-torace').value = data.c_torace || '';
    if (document.getElementById('c-vita')) document.getElementById('c-vita').value = data.c_vita || '';
    if (document.getElementById('c-fianchi')) document.getElementById('c-fianchi').value = data.c_fianchi || '';
    if (document.getElementById('c-gluteo')) document.getElementById('c-gluteo').value = data.c_gluteo || '';
    if (document.getElementById('c-braccio-ril')) document.getElementById('c-braccio-ril').value = data.c_braccio || '';
    if (document.getElementById('c-braccio-con')) document.getElementById('c-braccio-con').value = data.c_braccio_contratto || '';
    if (document.getElementById('c-coscia')) document.getElementById('c-coscia').value = data.c_coscia || '';

    const pliche = ['pettorale', 'ascellare', 'addome', 'soprailiaca', 'tricipitale', 'sottoscapolare', 'coscia'];
    pliche.forEach(p => {
      const el = document.getElementById(`p-${p}`);
      if (el) el.value = data[`p_${p}`] || '';
    });
  } catch (err) { console.error(err); }
}

function set(id, val) { const el = document.getElementById(id); if (el) el.innerHTML = val; }
function src(id, url) { const el = document.getElementById(id); if (el) el.src = url; }

function elaboraAnteprimaReport() {
  if (!currentPatient) { alert('⚠️ Seleziona un paziente attivo.'); return; }

  const sesso = currentPatient.sesso;
  const peso = n('in-peso');
  const altezza = n('in-altezza');
  const eta = n('in-eta');
  const laf = parseFloat(document.getElementById('in-laf').value);
  const nom = currentPatient.nominativo.toUpperCase();
  
  // Costruzione della stringa HTML con tag span strutturato per il wrapping CSS nativo
  const atletaTextHtml = `ATLETA: <span class="atleta-name-wrap">${nom}</span>`;

  const oggi = new Date();
  const dataStringa = [oggi.getDate(), oggi.getMonth() + 1, oggi.getFullYear()].map(x => String(x).padStart(2, '0')).join('-');

  const silPath = sesso === 'M' ? FILES.silM : FILES.silF;
  const elitePath = sesso === 'M' ? FILES.eliteM : FILES.eliteF;
  ['r-sil-l', 'r-sil-r'].forEach(id => src(id, silPath));
  ['r-esil-l', 'r-esil-r'].forEach(id => src(id, elitePath));
  ['r-logo1', 'r-logo2', 'r-wm1', 'r-wm2'].forEach(id => src(id, FILES.logo));

  set('r-nome1', atletaTextHtml); set('r-data1', dataStringa);
  set('r-nome2', atletaTextHtml); set('r-data2', dataStringa);

  let bmrV = '-', rmrV = '-', tdeeV = '-', tdeewV = '-';
  if (peso > 0 && altezza > 0 && eta > 0) {
    let bmr = sesso === 'M' ? (10 * peso + 6.25 * altezza - 5 * eta + 5) : (10 * peso + 6.25 * altezza - 5 * eta - 161);
    let rmr = sesso === 'M' ? (66.473 + 13.7516 * peso + 5.0033 * altezza - 6.755 * eta) : (655.0955 + 9.5634 * peso + 1.8496 * altezza - 4.6756 * eta);

    bmrV = Math.round(bmr) + " kcal";
    rmrV = Math.round(rmr) + " kcal";
    tdeeV = Math.round(bmr * laf) + " kcal";
    tdeewV = Math.round(bmr * laf * 7) + " kcal/sett";
  }
  set('r-bmr', bmrV); set('r-rmr', rmrV); set('r-tdee', tdeeV); set('r-tdeew', tdeewV);

  const pk = sesso === 'M' ? ['Pettorale', 'Ascellare', 'Addome', 'Soprailiaca', 'Tricipitale', 'Sottoscapolare', 'Coscia'] : ['Addome', 'Soprailiaca', 'Tricipitale', 'Sottoscapolare', 'Coscia'];
  let sommaPliche = 0;
  let haPliche = false;
  pk.forEach(p => {
    let v = parseFloat(document.getElementById('p-' + p.toLowerCase())?.value) || 0;
    sommaPliche += v;
    if (v > 0) haPliche = true;
  });

  let gccV = '-', fmV = '-', ffmV = '-', ibwV = '-', kggV = '-', kgmV = '-';
  if (haPliche && peso > 0 && eta > 0) {
    let densita = sesso === 'M'
      ? 1.112 - (0.00043499 * sommaPliche) + (0.00000055 * sommaPliche * sommaPliche) - (0.00028826 * eta)
      : 1.0994921 - (0.0009929 * sommaPliche) + (0.0000023 * sommaPliche * sommaPliche) - (0.0001392 * eta);
    
    let fm = (495 / densita) - 450;
    let ffm = 100 - fm;
    let kgg = (peso * fm) / 100;
    let kgm = peso - kgg;

    let iMin = sesso === 'M' ? kgm / 0.90 : kgm / 0.82;
    let iMax = sesso === 'M' ? kgm / 0.88 : kgm / 0.78;

    gccV = densita.toFixed(4).replace('.', ',') + " g/cc";
    fmV = fm.toFixed(2).replace('.', ',') + " %";
    ffmV = ffm.toFixed(2).replace('.', ',') + " %";
    ibwV = Math.round(iMin) + " - " + Math.round(iMax) + " kg";
    kggV = kgg.toFixed(2).replace('.', ',') + " kg";
    kgmV = kgm.toFixed(2).replace('.', ',') + " kg";
  }

  const nPliche = sesso === 'M' ? 7 : 5;
  set('r-lbl-pliche', `Plicometria totale (${nPliche} pliche):`);
  set('r-pliche', haPliche ? sommaPliche.toFixed(1).replace('.', ',') + " mm" : "-");
  set('r-gcc', gccV); set('r-fm', fmV); set('r-ffm', ffmV); set('r-ibw', ibwV); set('r-kgg', kggV); set('r-kgm', kgmV);
  set('r-peso', peso > 0 ? peso.toFixed(2).replace('.', ',') + " kg" : "-");

  const formatVal = id => {
    const el = document.getElementById(id);
    return el && el.value ? el.value.toString().replace('.', ',') : '-';
  };

  let rows = `<tr><td>Peso</td><td><strong>${formatVal('in-peso')} kg</strong></td></tr>
              <tr><td>Altezza</td><td><strong>${formatVal('in-altezza')} cm</strong></td></tr>
              <tr><td>Circonferenza collo</td><td><strong>${formatVal('c-collo')} cm</strong></td></tr>`;
  
  if (sesso === 'M') {
    rows += `<tr><td>Circonferenza toracica</td><td><strong>${formatVal('c-torace')} cm</strong></td></tr>`;
  }
  rows += `<tr><td>Circonferenza vita</td><td><strong>${formatVal('c-vita')} cm</strong></td></tr>
           <tr><td>Circonferenza fianchi</td><td><strong>${formatVal('c-fianchi')} cm</strong></td></tr>`;
  if (sesso === 'F') {
    rows += `<tr><td>Circonferenza gluteo</td><td><strong>${formatVal('c-gluteo')} cm</strong></td></tr>`;
  }
  rows += `<tr><td>Circonferenza braccio rilassato</td><td><strong>${formatVal('c-braccio-ril')} cm</strong></td></tr>
           <tr><td>Circonferenza braccio contratto</td><td><strong>${formatVal('c-braccio-con')} cm</strong></td></tr>
           <tr><td>Circonferenza coscia</td><td><strong>${formatVal('c-coscia')} cm</strong></td></tr>`;

  pk.forEach(p => {
    rows += `<tr><td>Plica ${p.toLowerCase()}</td><td><strong>${formatVal('p-' + p.toLowerCase())} mm</strong></td></tr>`;
  });

  document.getElementById('r-antro-rows').innerHTML = rows;

  const metodo = sesso === 'M' ? 'Jackson & Pollock / 7 pliche' : 'Jackson & Pollock / 5 pliche';
  document.getElementById('r-footer').innerHTML = `
    <p>Plicometro: GIMA DIGITALE (modello 37320)</p>
    <p>Metodo: ${metodo}</p>
    <p>Somma pliche (mm) = ${sommaPliche.toFixed(2).replace('.', ',')} mm</p>
  `;

  document.getElementById('preview-area').style.display = 'block';
  gestisciAnteprimaMobile();
  document.getElementById('btn-pdf').scrollIntoView({ behavior: 'smooth' });
}

async function scaricaPDF() {
  const btn = document.getElementById('btn-pdf');
  btn.disabled = true;
  btn.textContent = '⏳ Generazione Canvas...';

  const wraps = document.querySelectorAll('.pg-wrap');
  const watermarks = document.querySelectorAll('.wmark');
  const vecchieTrasformazioni = [];
  const isMobile = window.innerWidth <= 820;

  wraps.forEach(el => {
    vecchieTrasformazioni.push(el.style.transform);
    el.style.transform = 'none'; 
  });

  if (isMobile) {
    watermarks.forEach(wm => wm.style.setProperty('width', '502px', 'important'));
  }

  try {
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    const pagine = [document.getElementById('pdf-p1'), document.getElementById('pdf-p2')];

    for (let i = 0; i < pagine.length; i++) {
      const canvas = await html2canvas(pagine[i], {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        logging: false,
        width: 794,
        height: 1123,
        windowWidth: 794,  
        windowHeight: 1123
      });
      const img = canvas.toDataURL('image/jpeg', 0.97);
      if (i > 0) pdf.addPage();
      pdf.addImage(img, 'JPEG', 0, 0, 210, 297);
    }

    const nom = currentPatient?.nominativo || 'PAZIENTE';
    pdf.save(`${nom} - Composizione corporea e Fabbisogni energetici.pdf`);
  } catch (e) {
    console.error(e);
    alert('Errore esportazione jspdf.');
  }

  if (isMobile) {
    watermarks.forEach(wm => wm.style.removeProperty('width'));
  }
  wraps.forEach((el, index) => el.style.transform = vecchieTrasformazioni[index]);
  btn.disabled = false;
  btn.textContent = '📥 Scarica PDF Report';
}
