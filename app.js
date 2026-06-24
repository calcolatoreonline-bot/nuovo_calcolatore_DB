/* ══════════════════════════════════════════════════════════════════════════════
   DASHBOARD NUTRIZIONE ELITE - app.js VERSIONE 3.1 (SUPER BLINDATA)
══════════════════════════════════════════════════════════════════════════════ */

const supabaseUrl = 'https://ympbqcmbhnjerjqxgska.supabase.co';
const supabaseKey = 'sb_publishable_8bs12qrDkQmPi4pOQTMQyg_ef9r5-KW';

let supabase = window.supabaseClient || null;

try {
  if (!supabase && window.supabase && typeof window.supabase.createClient === 'function') {
    supabase = window.supabase.createClient(supabaseUrl, supabaseKey);
    window.supabaseClient = supabase;
    console.log('✅ Supabase inizializzato correttamente e protetto da duplicazioni');
  } else if (supabase) {
    console.log('🔄 Supabase già presente, riutilizzo l\'istanza esistente');
  } else {
    console.error('❌ Libreria Supabase non caricata globalmente!');
  }
} catch (err) {
  console.error('❌ Eccezione durante l\'inizializzazione di Supabase:', err);
}

let currentPatient = null;
let currentVisitId = null;
let chartPesoInstance = null;
let chartCompInstance = null;

const FILES = {
  logo: 'logo_de_salvo_transparent.png',
  silM: 'Siluette_Uomo.jpeg',
  silF: 'Siluette_Donna.jpeg',
  eliteM: 'COMPOSIZIONE CORPOREA UOMO.JPEG',
  eliteF: 'COMPOSIZIONE CORPOREA DONNA.JPEG',
};

document.addEventListener('DOMContentLoaded', () => {
  console.log('✅ DOM completamente caricato.');
  initEventListeners();
});

function initEventListeners() {
  const btnOpenModal = document.getElementById('btn-open-modal');
  if (btnOpenModal) {
    btnOpenModal.addEventListener('click', (e) => {
      e.preventDefault();
      openModal();
    });
    console.log('✅ Listener bottone "Nuovo Paziente" attivato.');
  }

  document.getElementById('btn-close-modal')?.addEventListener('click', closeModal);
  document.getElementById('btn-close-modal-cancel')?.addEventListener('click', closeModal);
  document.getElementById('modal-overlay')?.addEventListener('click', closeModal);
  document.getElementById('btn-registra-paziente')?.addEventListener('click', registraPaziente);
  document.getElementById('patient-search')?.addEventListener('input', cercaPazienti);
  document.getElementById('btn-salva-visita')?.addEventListener('click', salvaVisita);
  document.getElementById('btn-calcola-report')?.addEventListener('click', () => {
    if (!currentPatient) {
      alert('⚠️ Seleziona prima un paziente attivo.');
      return;
    }
    generaPDFLogica();
  });
  
  document.getElementById('select-visita-storica')?.addEventListener('change', async (e) => {
    const val = e.target.value;
    if (val === 'new') {
      svuotaFormVisita();
      currentVisitId = null;
    } else {
      currentVisitId = val;
      await caricaDatiVisitaSingola(val);
    }
  });
}

function openModal() {
  document.getElementById('modal-paziente')?.classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modal-paziente')?.classList.add('hidden');
  document.getElementById('new-nominativo').value = '';
  document.getElementById('new-sesso').value = '';
  document.getElementById('new-nascita').value = '';
}

async function cercaPazienti(e) {
  const query = e.target.value.toUpperCase().trim();
  const resultsDiv = document.getElementById('search-results');
  
  if (query.length < 2) {
    resultsDiv.innerHTML = '';
    return;
  }
  if (!supabase) return;

  try {
    const { data, error } = await supabase
      .from('pazienti')
      .select('*')
      .ilike('nominativo', `%${query}%`)
      .limit(5);
    
    if (error) throw error;

    resultsDiv.innerHTML = data.map(p => `
      <div class="search-result-item" data-id="${p.id}" data-name="${p.nominativo}" data-gender="${p.sesso}" data-birth="${p.data_nascita || ''}">
        <strong>${p.nominativo}</strong> <span style="font-size:12px; color:#6b7280;">(${p.sesso === 'M' ? 'Uomo' : 'Donna'})</span>
      </div>
    `).join('');

    document.querySelectorAll('.search-result-item').forEach(item => {
      item.addEventListener('click', function() {
        selezionaPaziente(
          this.getAttribute('data-id'),
          this.getAttribute('data-name'),
          this.getAttribute('data-gender'),
          this.getAttribute('data-birth')
        );
      });
    });
  } catch (err) {
    console.error('❌ Errore ricerca:', err.message);
  }
}

async function registraPaziente() {
  const nom = document.getElementById('new-nominativo').value.toUpperCase().trim();
  const sesso = document.getElementById('new-sesso').value;
  const nascita = document.getElementById('new-nascita').value || null;

  if (!nom || !sesso) {
    alert('⚠️ Campi obbligatori mancanti.');
    return;
  }
  if (!supabase) return;

  try {
    const { data, error } = await supabase
      .from('pazienti')
      .insert([{ nominativo: nom, sesso, data_nascita: nascita }])
      .select();
    
    if (error) throw error;

    closeModal();
    await selezionaPaziente(data[0].id, data[0].nominativo, data[0].sesso, data[0].data_nascita);
    alert('✅ Nuovo profilo registrato ed impostato come attivo!');
  } catch (err) {
    alert('❌ Errore nel database: ' + err.message);
  }
}

async function selezionaPaziente(id, nominativo, sesso, data_nascita) {
  currentPatient = { id, nominativo, sesso, data_nascita };
  document.getElementById('search-results').innerHTML = '';
  document.getElementById('patient-search').value = '';
  
  const nameHeader = document.getElementById('current-patient-name');
  const genderBadge = document.getElementById('patient-gender-badge');
  
  if (nameHeader) nameHeader.textContent = nominativo;
  if (genderBadge) {
    genderBadge.textContent = sesso === 'M' ? '👨 Uomo' : '👩 Donna';
    genderBadge.classList.remove('hidden');
  }
  
  document.getElementById('in-nominativo').value = nominativo;
  document.getElementById('in-sesso').value = sesso;

  aggiornaFormUI(sesso);
  await caricaStoricoVisite(id);
  svuotaFormVisita();
  currentVisitId = null;
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
      <div class="form-group"><label>Braccio (cm)</label><input type="number" id="c-braccio" step="0.1" placeholder="34"></div>
      <div class="form-group"><label>Coscia (cm)</label><input type="number" id="c-coscia" step="0.1" placeholder="58"></div>
    `;
    const pM = ['Pettorale', 'Ascellare', 'Addome', 'Soprailiaca', 'Tricipitale', 'Sottoscapolare', 'Coscia'];
    contPliche.innerHTML = pM.map(p => `
      <div class="form-group"><label>${p} (mm)</label><input type="number" id="p-${p.toLowerCase()}" step="0.1" placeholder="12"></div>
    `).join('');
  } else {
    contAntro.innerHTML = `
      <div class="form-group"><label>Collo (cm)</label><input type="number" id="c-collo" step="0.1" placeholder="34"></div>
      <div class="form-group"><label>Vita (cm)</label><input type="number" id="c-vita" step="0.1" placeholder="68"></div>
      <div class="form-group"><label>Fianchi (cm)</label><input type="number" id="c-fianchi" step="0.1" placeholder="92"></div>
      <div class="form-group"><label>Gluteo (cm)</label><input type="number" id="c-gluteo" step="0.1" placeholder="98"></div>
      <div class="form-group"><label>Braccio (cm)</label><input type="number" id="c-braccio" step="0.1" placeholder="28"></div>
      <div class="form-group"><label>Coscia (cm)</label><input type="number" id="c-coscia" step="0.1" placeholder="52"></div>
    `;
    const pF = ['Addome', 'Soprailiaca', 'Tricipitale', 'Sottoscapolare', 'Coscia'];
    contPliche.innerHTML = pF.map(p => `
      <div class="form-group"><label>${p} (mm)</label><input type="number" id="p-${p.toLowerCase()}" step="0.1" placeholder="14"></div>
    `).join('');
  }
}

async function caricaStoricoVisite(pazienteId) {
  if (!supabase) return;
  try {
    const { data, error } = await supabase
      .from('visite')
      .select('*')
      .eq('paziente_id', pazienteId)
      .order('data_visita', { ascending: true });
    
    if (error) throw error;

    const select = document.getElementById('select-visita-storica');
    select.innerHTML = '<option value="new">➕ Nuova Visita (Oggi)</option>';
    data.forEach(v => {
      const dataF = new Date(v.data_visita).toLocaleDateString('it-IT');
      select.innerHTML += `<option value="${v.id}">Visita del ${dataF} (${v.peso} kg)</option>`;
    });

    aggiornaGrafici(data);
  } catch (err) {
    console.error('❌ Errore storico:', err.message);
  }
}

function aggiornaGrafici(visite) {
  if (visite.length === 0) return;
  const labels = visite.map(v => new Date(v.data_visita).toLocaleDateString('it-IT'));
  const pesi = visite.map(v => v.peso);

  if (chartPesoInstance) chartPesoInstance.destroy();
  
  const ctxPeso = document.getElementById('chart-peso').getContext('2d');
  chartPesoInstance = new Chart(ctxPeso, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Peso Corporeo (kg)',
        data: pesi,
        borderColor: '#1e40af',
        backgroundColor: 'rgba(30, 64, 175, 0.05)',
        borderWidth: 3,
        tension: 0.2,
        fill: true,
        pointRadius: 5
      }]
    },
    options: { responsive: true }
  });
}

const n = id => parseFloat(document.getElementById(id)?.value) || 0;

async function salvaVisita() {
  if (!currentPatient) {
    alert('⚠️ Nessun paziente selezionato.');
    return;
  }

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
    c_braccio: n('c-braccio'),
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

  if (!supabase) return;

  try {
    let res;
    if (currentVisitId) {
      res = await supabase.from('visite').update(payload).eq('id', currentVisitId).select();
    } else {
      res = await supabase.from('visite').insert([payload]).select();
    }

    if (res.error) throw res.error;

    alert('✅ Record della visita archiviato con successo!');
    await caricaStoricoVisite(currentPatient.id);
  } catch (err) {
    alert('❌ Errore durante il salvataggio: ' + err.message);
  }
}

async function caricaDatiVisitaSingola(id) {
  if (!supabase) return;
  try {
    const { data, error } = await supabase.from('visite').select('*').eq('id', id).single();
    if (error) throw error;

    document.getElementById('in-eta').value = data.eta || '';
    document.getElementById('in-peso').value = data.peso || '';
    document.getElementById('in-altezza').value = data.altezza || '';
    document.getElementById('in-laf').value = data.laf || '1.55';

    if (document.getElementById('c-collo')) document.getElementById('c-collo').value = data.c_collo || '';
    if (document.getElementById('c-torace')) document.getElementById('c-torace').value = data.c_torace || '';
    if (document.getElementById('c-vita')) document.getElementById('c-vita').value = data.c_vita || '';
    if (document.getElementById('c-fianchi')) document.getElementById('c-fianchi').value = data.c_fianchi || '';
    if (document.getElementById('c-gluteo')) document.getElementById('c-gluteo').value = data.c_gluteo || '';
    if (document.getElementById('c-braccio')) document.getElementById('c-braccio').value = data.c_braccio || '';
    if (document.getElementById('c-coscia')) document.getElementById('c-coscia').value = data.c_coscia || '';

    const pliche = ['pettorale', 'ascellare', 'addome', 'soprailiaca', 'tricipitale', 'sottoscapolare', 'coscia'];
    pliche.forEach(p => {
      const el = document.getElementById(`p-${p}`);
      if (el) el.value = data[`p_${p}`] || '';
    });
  } catch (err) {
    console.error(err);
  }
}

function svuotaFormVisita() {
  document.getElementById('form-valutazione').reset();
  document.getElementById('in-laf').value = '1.55';
}

function set(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

async function generaPDFLogica() {
  const sesso = currentPatient.sesso;
  const nominativo = currentPatient.nominativo;
  const peso = n('in-peso');
  const altezza = n('in-altezza');
  const eta = n('in-eta');
  const laf = n('in-laf');

  const odierna = new Date().toLocaleDateString('it-IT');
  set('r-nome1', nominativo);
  set('r-data1', odierna);
  set('r-nome2', nominativo);
  set('r-data2', odierna);

  let bmrV = '-', rmrV = '-', tdeeV = '-', tdeewV = '-';
  if (peso > 0 && altezza > 0 && eta > 0) {
    let bmr = (10 * peso) + (6.25 * altezza) - (5 * eta) + (sesso === 'M' ? 5 : -161);
    let rmr = sesso === 'M' 
      ? 66.473 + (13.7516 * peso) + (5.0033 * altezza) - (6.755 * eta)
      : 655.0955 + (9.5634 * peso) + (1.8496 * altezza) - (4.6756 * eta);

    bmrV = Math.round(bmr) + ' kcal';
    rmrV = Math.round(rmr) + ' kcal';
    tdeeV = Math.round(bmr * laf) + ' kcal';
    tdeewV = Math.round(bmr * laf * 7) + ' kcal/sett';
  }

  set('r-bmr', bmrV);
  set('r-rmr', rmrV);
  set('r-tdee', tdeeV);
  set('r-tdeew', tdeewV);

  let sommaPliche = 0;
  const plicheList = sesso === 'M' 
    ? ['pettorale', 'ascellare', 'addome', 'soprailiaca', 'tricipitale', 'sottoscapolare', 'coscia']
    : ['addome', 'soprailiaca', 'tricipitale', 'sottoscapolare', 'coscia'];

  plicheList.forEach(p => { sommaPliche += n(`p-${p}`); });
  const haPliche = sommaPliche > 0;

  let gccV = '-', fmV = '-', ffmV = '-', ibwV = '-';
  if (haPliche && peso > 0 && eta > 0) {
    let gcc = 0;
    if (sesso === 'M') {
      let bd = 1.112 - (0.00043499 * sommaPliche) + (0.00000055 * sommaPliche * sommaPliche) - (0.00028826 * eta);
      gcc = ((4.95 / bd) - 4.5) * 100;
    } else {
      let bd = 1.0994921 - (0.0009929 * sommaPliche) + (0.0000023 * sommaPliche * sommaPliche) - (0.0001392 * eta);
      gcc = ((4.95 / bd) - 4.5) * 100;
    }
    if (gcc < 2) gcc = 2;
    if (gcc > 50) gcc = 50;

    let kgg = (peso * gcc) / 100;
    let kgm = peso - kgg;

    gccV = gcc.toFixed(1).replace('.', ',') + ' %';
    fmV = kgg.toFixed(1).replace('.', ',') + ' kg';
    ffmV = kgm.toFixed(1).replace('.', ',') + ' kg';
  }

  let hIn = altezza / 2.54;
  let ibw = sesso === 'M' ? 50 + 2.3 * (hIn - 60) : 45.5 + 2.3 * (hIn - 60);
  ibwV = (Math.round(ibw) - 2) + ' - ' + (Math.round(ibw) + 2) + ' kg';

  set('r-gcc', gccV);
  set('r-fm', fmV);
  set('r-ffm', ffmV);
  set('r-ibw', ibwV);
  set('r-pliche', haPliche ? sommaPliche.toFixed(1).replace('.', ',') + ' mm' : '-');
  set('r-peso', peso > 0 ? peso.toFixed(1).replace('.', ',') + ' kg' : '-');

  const areaRender = document.getElementById('preview-area');
  areaRender.classList.remove('hidden-pdf-render');

  try {
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    const pagine = [document.getElementById('pdf-p1'), document.getElementById('pdf-p2')];

    for (let i = 0; i < pagine.length; i++) {
      const canvas = await html2canvas(pagine[i], {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        width: 794,
        height: 1123
      });
      const imgData = canvas.toDataURL('image/jpeg', 0.98);
      if (i > 0) pdf.addPage();
      pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297);
    }

    const nomeFile = `${nominativo} - Composizione corporea e Fabbisogni energetici.pdf`;
    pdf.save(nomeFile);
    console.log('✅ Documento scaricato:', nomeFile);
  } catch (err) {
    console.error('❌ Errore durante l\'esportazione del PDF:', err);
  } finally {
    areaRender.classList.add('hidden-pdf-render');
  }
}
