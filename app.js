/* ══════════════════════════════════════════════════════════════════════════════
   1. CONFIGURAZIONE SUPABASE
══════════════════════════════════════════════════════════════════════════════ */
const supabaseUrl = 'https://ympbqcmbhnjerjqxgska.supabase.co';
const supabaseKey = 'sb_publishable_8bs12qrDkQmPi4pOQTMQyg_ef9r5-KW';
const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

/* ══════════════════════════════════════════════════════════════════════════════
   2. VARIABILI DI STATO E RISORSE PDF
══════════════════════════════════════════════════════════════════════════════ */
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

/* ══════════════════════════════════════════════════════════════════════════════
   3. INIZIALIZZAZIONE - Form visibile al caricamento
══════════════════════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  // Mostra il form visita anche senza paziente selezionato
  document.getElementById('section-visita-form').classList.remove('hidden');
  document.getElementById('charts-section').classList.remove('hidden');
  document.getElementById('selected-patient-card').classList.remove('hidden');
});

/* ══════════════════════════════════════════════════════════════════════════════
   4. GESTIONE MODALE NUOVO PAZIENTE
══════════════════════════════════════════════════════════════════════════════ */
const modalPaziente = document.getElementById('modal-paziente');
const btnOpenModal = document.getElementById('btn-open-modal');
const btnCloseModal = document.getElementById('btn-close-modal');
const btnCloseModalCancel = document.getElementById('btn-close-modal-cancel');
const modalOverlay = document.getElementById('modal-overlay');

function openModal() {
  modalPaziente.classList.remove('hidden');
}

function closeModal() {
  modalPaziente.classList.add('hidden');
  // Reset form
  document.getElementById('new-nominativo').value = '';
  document.getElementById('new-sesso').value = '';
  document.getElementById('new-nascita').value = '';
}

btnOpenModal.addEventListener('click', openModal);
btnCloseModal.addEventListener('click', closeModal);
btnCloseModalCancel.addEventListener('click', closeModal);
modalOverlay.addEventListener('click', closeModal);

// Evita che il click sulla modale la chiuda
document.querySelector('.modal-content').addEventListener('click', (e) => {
  e.stopPropagation();
});

/* ══════════════════════════════════════════════════════════════════════════════
   5. RICERCA PAZIENTI
══════════════════════════════════════════════════════════════════════════════ */
document.getElementById('patient-search').addEventListener('input', async (e) => {
  const query = e.target.value.toUpperCase().trim();
  const resultsDiv = document.getElementById('search-results');
  
  if (query.length < 2) {
    resultsDiv.innerHTML = '';
    return;
  }

  try {
    const { data, error } = await supabase
      .from('pazienti')
      .select('*')
      .ilike('nominativo', `%${query}%`)
      .limit(5);
    
    if (error) {
      console.error('Errore ricerca:', error);
      return;
    }

    resultsDiv.innerHTML = data
      .map(p => `
        <div class="search-result-item" onclick="selezionaPaziente('${p.id}', '${p.nominativo}', '${p.sesso}', '${p.data_nascita || ''}')">
          ${p.nominativo} <span style="font-size: 12px; color: #999;">(${p.sesso === 'M' ? 'Uomo' : 'Donna'})</span>
        </div>
      `)
      .join('');
  } catch (err) {
    console.error('Errore:', err);
  }
});

/* ══════════════════════════════════════════════════════════════════════════════
   6. REGISTRAZIONE NUOVO PAZIENTE
══════════════════════════════════════════════════════════════════════════════ */
document.getElementById('btn-registra-paziente').addEventListener('click', async () => {
  const nom = document.getElementById('new-nominativo').value.toUpperCase().trim();
  const sesso = document.getElementById('new-sesso').value;
  const nascita = document.getElementById('new-nascita').value || null;

  // Validazione
  if (!nom) {
    alert('⚠️ Inserisci il cognome e il nome');
    return;
  }
  if (!sesso) {
    alert('⚠️ Seleziona il sesso');
    return;
  }

  try {
    const { data, error } = await supabase
      .from('pazienti')
      .insert([{ nominativo: nom, sesso, data_nascita: nascita }])
      .select();
    
    if (error) {
      alert('❌ Errore nel salvataggio: ' + error.message);
      return;
    }

    // Successo - Chiudi modale e seleziona paziente
    closeModal();
    await selezionaPaziente(data[0].id, data[0].nominativo, data[0].sesso, data[0].data_nascita);
    alert('✅ Paziente registrato con successo!');
  } catch (err) {
    console.error('Errore:', err);
    alert('❌ Errore: ' + err.message);
  }
});

/* ══════════════════════════════════════════════════════════════════════════════
   7. SELEZIONE PAZIENTE
══════════════════════════════════════════════════════════════════════════════ */
async function selezionaPaziente(id, nominativo, sesso, data_nascita) {
  try {
    currentPatient = { id, nominativo, sesso, data_nascita };
    document.getElementById('search-results').innerHTML = '';
    document.getElementById('patient-search').value = '';
    
    // Mostra tutte le sezioni
    document.getElementById('selected-patient-card').classList.remove('hidden');
    document.getElementById('section-visita-form').classList.remove('hidden');
    document.getElementById('charts-section').classList.remove('hidden');
    
    // Aggiorna header con info paziente
    document.getElementById('current-patient-name').textContent = nominativo;
    document.getElementById('patient-gender-badge').textContent = sesso === 'M' ? '👨 Uomo' : '👩 Donna';
    
    // Setta valori nascosti nel form
    document.getElementById('in-nominativo').value = nominativo;
    document.getElementById('in-sesso').value = sesso;

    // Aggiorna form UI (campi antropometrici e pliche)
    aggiornaFormUI(sesso);
    
    // Carica storico visite e grafici
    await caricaStoricoVisite(id);
    
    // Svuota form per nuova visita
    svuotaFormVisita();
  } catch (err) {
    console.error('Errore selezione paziente:', err);
    alert('❌ Errore nel caricamento del paziente');
  }
}

/* ══════════════════════════════════════════════════════════════════════════════
   8. AGGIORNAMENTO FORM UI (Misure antropometriche e pliche)
══════════════════════════════════════════════════════════════════════════════ */
function aggiornaFormUI(sesso) {
  // Misure antropometriche
  document.getElementById('cont-antro').innerHTML = sesso === 'M' ? `
    <div class="form-group">
      <label>Collo (cm)</label>
      <input type="number" id="c-collo" step="0.1" placeholder="35.0">
    </div>
    <div class="form-group">
      <label>Torace (cm)</label>
      <input type="number" id="c-torace" step="0.1" placeholder="100.0">
    </div>
    <div class="form-group">
      <label>Vita (cm)</label>
      <input type="number" id="c-vita" step="0.1" placeholder="85.0">
    </div>
    <div class="form-group">
      <label>Fianchi (cm)</label>
      <input type="number" id="c-fianchi" step="0.1" placeholder="95.0">
    </div>
    <div class="form-group">
      <label>Braccio (cm)</label>
      <input type="number" id="c-braccio" step="0.1" placeholder="32.0">
    </div>
    <div class="form-group">
      <label>Coscia (cm)</label>
      <input type="number" id="c-coscia" step="0.1" placeholder="60.0">
    </div>
  ` : `
    <div class="form-group">
      <label>Collo (cm)</label>
      <input type="number" id="c-collo" step="0.1" placeholder="32.0">
    </div>
    <div class="form-group">
      <label>Vita (cm)</label>
      <input type="number" id="c-vita" step="0.1" placeholder="75.0">
    </div>
    <div class="form-group">
      <label>Fianchi (cm)</label>
      <input type="number" id="c-fianchi" step="0.1" placeholder="95.0">
    </div>
    <div class="form-group">
      <label>Gluteo (cm)</label>
      <input type="number" id="c-gluteo" step="0.1" placeholder="100.0">
    </div>
    <div class="form-group">
      <label>Braccio (cm)</label>
      <input type="number" id="c-braccio" step="0.1" placeholder="28.0">
    </div>
    <div class="form-group">
      <label>Coscia (cm)</label>
      <input type="number" id="c-coscia" step="0.1" placeholder="55.0">
    </div>
  `;

  // Pliche
  const pliche = sesso === 'M' 
    ? ['Pettorale', 'Ascellare', 'Addome', 'Soprailiaca', 'Tricipitale', 'Sottoscapolare', 'Coscia']
    : ['Addome', 'Soprailiaca', 'Tricipitale', 'Sottoscapolare', 'Coscia'];
  
  document.getElementById('cont-pliche').innerHTML = pliche
    .map(p => `
      <div class="form-group">
        <label>${p} (mm)</label>
        <input type="number" id="p-${p.toLowerCase()}" step="0.1" placeholder="10.0">
      </div>
    `)
    .join('');
}

/* ══════════════════════════════════════════════════════════════════════════════
   9. STORICO VISITE E GRAFICI
══════════════════════════════════════════════════════════════════════════════ */
async function caricaStoricoVisite(pazienteId) {
  try {
    const { data, error } = await supabase
      .from('visite')
      .select('*')
      .eq('paziente_id', pazienteId)  // FIXME CORRETTO: era 'pacienteId'
      .order('data_visita', { ascending: true });
    
    if (error) {
      console.error('Errore caricamento visite:', error);
      return;
    }

    const select = document.getElementById('select-visita-storica');
    select.innerHTML = '<option value="new">➕ Nuova Visita (Oggi)</option>';
    
    data.forEach(v => {
      select.innerHTML += `<option value="${v.id}">${v.data_visita} (${v.peso}kg)</option>`;
    });

    // Aggiorna grafici
    aggiornaGrafici(data);

    // Event listener per cambio visita
    select.onchange = (e) => {
      if (e.target.value === 'new') {
        svuotaFormVisita();
        currentVisitId = null;
      } else {
        const visita = data.find(x => x.id === e.target.value);
        if (visita) {
          popolaFormVisita(visita);
          currentVisitId = visita.id;
        }
      }
    };
  } catch (err) {
    console.error('Errore:', err);
  }
}

/* ══════════════════════════════════════════════════════════════════════════════
   10. AGGIORNAMENTO GRAFICI
══════════════════════════════════════════════════════════════════════════════ */
function aggiornaGrafici(visite) {
  if (visite.length === 0) return;

  const date = visite.map(v => v.data_visita);
  const pesi = visite.map(v => v.peso);
  
  // Distruggi grafici precedenti
  if (chartPesoInstance) chartPesoInstance.destroy();
  if (chartCompInstance) chartCompInstance.destroy();

  // Grafico peso
  const ctxPeso = document.getElementById('chart-peso').getContext('2d');
  chartPesoInstance = new Chart(ctxPeso, {
    type: 'line',
    data: {
      labels: date,
      datasets: [{
        label: 'Peso (kg)',
        data: pesi,
        borderColor: '#1e40af',
        backgroundColor: 'rgba(30, 64, 175, 0.05)',
        borderWidth: 3,
        tension: 0.3,
        fill: true,
        pointRadius: 6,
        pointBackgroundColor: '#1e40af',
        pointBorderColor: 'white',
        pointBorderWidth: 2,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { display: true, labels: { font: { size: 12 }, boxWidth: 15 } },
      },
      scales: {
        y: { beginAtZero: false, title: { display: true, text: 'kg' } }
      }
    }
  });

  // Grafico composizione
  const ctxComp = document.getElementById('chart-composizione').getContext('2d');
  chartCompInstance = new Chart(ctxComp, {
    type: 'line',
    data: {
      labels: date,
      datasets: [{
        label: 'Peso (kg)',
        data: pesi,
        borderColor: '#059669',
        backgroundColor: 'rgba(5, 150, 105, 0.05)',
        borderWidth: 3,
        tension: 0.3,
        fill: true,
        pointRadius: 6,
        pointBackgroundColor: '#059669',
        pointBorderColor: 'white',
        pointBorderWidth: 2,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { display: true, labels: { font: { size: 12 }, boxWidth: 15 } },
      },
      scales: {
        y: { beginAtZero: false, title: { display: true, text: 'kg' } }
      }
    }
  });
}

/* ══════════════════════════════════════════════════════════════════════════════
   11. GESTIONE FORM VISITA
══════════════════════════════════════════════════════════════════════════════ */
function svuotaFormVisita() {
  document.querySelectorAll('#form-valutazione input[type="number"]').forEach(el => {
    el.value = '';
  });
}

function popolaFormVisita(v) {
  document.getElementById('in-eta').value = v.eta || '';
  document.getElementById('in-peso').value = v.peso || '';
  document.getElementById('in-altezza').value = v.altezza || '';
  document.getElementById('in-laf').value = v.laf || '1.375';
  
  ['collo', 'torace', 'vita', 'fianchi', 'gluteo', 'braccio', 'coscia'].forEach(c => {
    const el = document.getElementById(`c-${c}`);
    if (el && v[`c_${c}`]) el.value = v[`c_${c}`];
  });
  
  ['pettorale', 'ascellare', 'addome', 'soprailiaca', 'tricipitale', 'sottoscapolare', 'coscia'].forEach(p => {
    const el = document.getElementById(`p-${p}`);
    if (el && v[`p_${p}`]) el.value = v[`p_${p}`];
  });
}

/* ══════════════════════════════════════════════════════════════════════════════
   12. FUNZIONI HELPER PER LETTURA VALORI
══════════════════════════════════════════════════════════════════════════════ */
const n = id => parseFloat(document.getElementById(id)?.value) || 0;
const v = id => { const el = document.getElementById(id); return el?.value?.trim() || ''; };
const formatVal = id => { const el = document.getElementById(id); return (!el || !el.value) ? '-' : el.value.toString().replace('.', ','); };
const formatPlica = (pm, key) => (pm[key] === undefined || pm[key] === 0 || isNaN(pm[key])) ? '-' : pm[key].toString().replace('.', ',');

function set(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }
function src(id, url) { const el = document.getElementById(id); if (el) el.src = url; }

/* ══════════════════════════════════════════════════════════════════════════════
   13. SALVATAGGIO VISITA
══════════════════════════════════════════════════════════════════════════════ */
document.getElementById('btn-salva-visita').addEventListener('click', async () => {
  if (!currentPatient) {
    alert('⚠️ Seleziona un paziente prima di salvare');
    return;
  }

  const payload = {
    paziente_id: currentPatient.id,
    eta: n('in-eta'),
    peso: n('in-peso'),
    altezza: n('in-altezza'),
    laf: n('in-laf'),
    c_collo: n('c-collo'),
    c_torace: n('c-torace'),
    c_vita: n('c-vita'),
    c_fianchi: n('c-fianchi'),
    c_gluteo: n('c-gluteo'),
    c_braccio: n('c-braccio'),
    c_coscia: n('c-coscia'),
    p_pettorale: n('p-pettorale'),
    p_ascellare: n('p-ascellare'),
    p_addome: n('p-addome'),
    p_soprailiaca: n('p-soprailiaca'),
    p_tricipitale: n('p-tricipitale'),
    p_sottoscapolare: n('p-sottoscapolare'),
    p_coscia: n('p-coscia'),
  };

  try {
    if (currentVisitId) {
      await supabase.from('visite').update(payload).eq('id', currentVisitId);
      alert('✅ Visita aggiornata!');
    } else {
      await supabase.from('visite').insert([payload]);
      alert('✅ Visita salvata!');
    }
    await caricaStoricoVisite(currentPatient.id);
  } catch (err) {
    console.error('Errore:', err);
    alert('❌ Errore nel salvataggio: ' + err.message);
  }
});

/* ══════════════════════════════════════════════════════════════════════════════
   14. GENERAZIONE REPORT PDF
══════════════════════════════════════════════════════════════════════════════ */
document.getElementById('btn-calcola-report').addEventListener('click', () => {
  if (!currentPatient) {
    alert('⚠️ Seleziona un paziente');
    return;
  }
  generaPDFLogica();
});

function generaPDFLogica() {
  const sesso = document.getElementById('in-sesso').value;
  const peso = n('in-peso');
  const altezza = n('in-altezza');
  const eta = n('in-eta');
  const laf = parseFloat(document.getElementById('in-laf').value);
  const nom = v('in-nominativo');
  const atleta = nom ? 'ATLETA: ' + nom : 'ATLETA:';
  
  // Data odierna
  const oggi = new Date();
  const dataStr = [oggi.getDate(), oggi.getMonth() + 1, oggi.getFullYear()]
    .map(x => String(x).padStart(2, '0'))
    .join('-');

  // Setta immagini PDF
  const silPath = sesso === 'M' ? FILES.silM : FILES.silF;
  const elitePath = sesso === 'M' ? FILES.eliteM : FILES.eliteF;
  ['r-sil-l', 'r-sil-r'].forEach(id => src(id, silPath));
  ['r-esil-l', 'r-esil-r'].forEach(id => src(id, elitePath));
  ['r-logo1', 'r-logo2', 'r-wm1', 'r-wm2'].forEach(id => src(id, FILES.logo));

  set('r-nome1', atleta);
  set('r-data1', dataStr);
  set('r-nome2', atleta);
  set('r-data2', dataStr);

  // Calcolo pliche
  const pk = sesso === 'M'
    ? ['Pettorale', 'Ascellare', 'Addome', 'Soprailiaca', 'Tricipitale', 'Sottoscapolare', 'Coscia']
    : ['Addome', 'Soprailiaca', 'Tricipitale', 'Sottoscapolare', 'Coscia'];
  
  const pm = {};
  let haPliche = false;
  pk.forEach(p => {
    const val = n('p-' + p.toLowerCase());
    pm[p] = val;
    if (val > 0) haPliche = true;
  });

  // Somma pliche
  let sommaPliche = 0;
  if (sesso === 'M') {
    sommaPliche = (pm['Pettorale'] || 0) + (pm['Ascellare'] || 0) + (pm['Addome'] || 0) +
                  (pm['Soprailiaca'] || 0) + (pm['Tricipitale'] || 0) + (pm['Sottoscapolare'] || 0) + (pm['Coscia'] || 0);
  } else {
    sommaPliche = (pm['Addome'] || 0) + (pm['Soprailiaca'] || 0) + (pm['Tricipitale'] || 0) +
                  (pm['Sottoscapolare'] || 0) + (pm['Coscia'] || 0);
  }

  // Calcoli energetici
  let bmrV = '-', rmrV = '-', tdeeV = '-', tdeewV = '-';
  if (peso > 0 && altezza > 0 && eta > 0) {
    let bmr = 0, rmr = 0;
    if (sesso === 'M') {
      bmr = 10 * peso + 6.25 * altezza - 5 * eta + 5;
      rmr = 66.473 + 13.7516 * peso + 5.0033 * altezza - 6.755 * eta;
    } else {
      bmr = 10 * peso + 6.25 * altezza - 5 * eta - 161;
      rmr = 655.0955 + 9.5634 * peso + 1.8496 * altezza - 4.6756 * eta;
    }
    bmrV = Math.round(bmr) + ' kcal';
    rmrV = Math.round(rmr) + ' kcal';
    tdeeV = Math.round(bmr * laf) + ' kcal';
    tdeewV = Math.round(bmr * laf * 7) + ' kcal/sett';
  }

  // Calcoli composizione corporea
  let gccV = '-', fmV = '-', ffmV = '-', ibwV = '-', kggV = '-', kgmV = '-';
  if (haPliche && peso > 0 && eta > 0) {
    let densita = sesso === 'M'
      ? 1.112 - (0.00043499 * sommaPliche) + (0.00000055 * Math.pow(sommaPliche, 2)) - (0.00028826 * eta)
      : 1.0994921 - (0.0009929 * sommaPliche) + (0.0000023 * Math.pow(sommaPliche, 2)) - (0.0001392 * eta);
    
    const fm = (495 / densita) - 450;
    const ffm = 100 - fm;
    const kgg = (peso * fm) / 100;
    const kgm = peso - kgg;
    let iMin = sesso === 'M' ? kgm / 0.90 : kgm / 0.82;
    let iMax = sesso === 'M' ? kgm / 0.88 : kgm / 0.78;
    
    gccV = densita.toFixed(4).replace('.', ',') + ' g/cc';
    fmV = fm.toFixed(2).replace('.', ',') + ' %';
    ffmV = ffm.toFixed(2).replace('.', ',') + ' %';
    ibwV = Math.round(iMin) + ' - ' + Math.round(iMax) + ' kg';
    kggV = kgg.toFixed(2).replace('.', ',') + ' kg';
    kgmV = kgm.toFixed(2).replace('.', ',') + ' kg';
  } else if (altezza > 0) {
    const hIn = altezza / 2.54;
    const ibw = sesso === 'M' ? 50 + 2.3 * (hIn - 60) : 45.5 + 2.3 * (hIn - 60);
    ibwV = (Math.round(ibw) - 2) + ' - ' + (Math.round(ibw) + 2) + ' kg';
  }

  // Setta valori nel PDF
  set('r-lbl-pliche', `Plicometria totale (${sesso === 'M' ? 7 : 5} pliche):`);
  set('r-bmr', bmrV);
  set('r-rmr', rmrV);
  set('r-tdee', tdeeV);
  set('r-tdeew', tdeewV);
  set('r-gcc', gccV);
  set('r-fm', fmV);
  set('r-ffm', ffmV);
  set('r-ibw', ibwV);
  set('r-kgg', kggV);
  set('r-kgm', kgmV);
  set('r-pliche', haPliche ? sommaPliche.toFixed(1).replace('.', ',') + ' mm' : '-');
  set('r-peso', peso > 0 ? peso.toFixed(2).replace('.', ',') + ' kg' : '-');

  // Tabella misure antropometriche
  let rows = `<tr><td>Peso</td><td>${formatVal('in-peso')}kg</td></tr><tr><td>Altezza</td><td>${formatVal('in-altezza')}cm</td></tr>`;
  
  if (sesso === 'M') {
    rows += `<tr><td>Circonferenza collo</td><td>${formatVal('c-collo')}</td></tr>`;
    rows += `<tr><td>Circonferenza toracica</td><td>${formatVal('c-torace')}</td></tr>`;
    rows += `<tr><td>Circonferenza vita</td><td>${formatVal('c-vita')}</td></tr>`;
    rows += `<tr><td>Circonferenza fianchi</td><td>${formatVal('c-fianchi')}</td></tr>`;
    rows += `<tr><td>Circonferenza braccio</td><td>${formatVal('c-braccio')}</td></tr>`;
    rows += `<tr><td>Circonferenza coscia</td><td>${formatVal('c-coscia')}</td></tr>`;
    rows += `<tr><td>Plica pettorale</td><td>${formatPlica(pm, 'Pettorale')}</td></tr>`;
    rows += `<tr><td>Plica ascellare</td><td>${formatPlica(pm, 'Ascellare')}</td></tr>`;
    rows += `<tr><td>Plica addome</td><td>${formatPlica(pm, 'Addome')}</td></tr>`;
    rows += `<tr><td>Plica sovrailiaca</td><td>${formatPlica(pm, 'Soprailiaca')}</td></tr>`;
    rows += `<tr><td>Plica tricipitale</td><td>${formatPlica(pm, 'Tricipitale')}</td></tr>`;
    rows += `<tr><td>Plica sottoscapolare</td><td>${formatPlica(pm, 'Sottoscapolare')}</td></tr>`;
    rows += `<tr><td>Plica coscia</td><td>${formatPlica(pm, 'Coscia')}</td></tr>`;
  } else {
    rows += `<tr><td>Circonferenza collo</td><td>${formatVal('c-collo')}</td></tr>`;
    rows += `<tr><td>Circonferenza vita</td><td>${formatVal('c-vita')}</td></tr>`;
    rows += `<tr><td>Circonferenza fianchi</td><td>${formatVal('c-fianchi')}</td></tr>`;
    rows += `<tr><td>Circonferenza gluteo</td><td>${formatVal('c-gluteo')}</td></tr>`;
    rows += `<tr><td>Circonferenza braccio</td><td>${formatVal('c-braccio')}</td></tr>`;
    rows += `<tr><td>Circonferenza coscia</td><td>${formatVal('c-coscia')}</td></tr>`;
    rows += `<tr><td>Plica addome</td><td>${formatPlica(pm, 'Addome')}</td></tr>`;
    rows += `<tr><td>Plica sovrailiaca</td><td>${formatPlica(pm, 'Soprailiaca')}</td></tr>`;
    rows += `<tr><td>Plica tricipitale</td><td>${formatPlica(pm, 'Tricipitale')}</td></tr>`;
    rows += `<tr><td>Plica sottoscapolare</td><td>${formatPlica(pm, 'Sottoscapolare')}</td></tr>`;
    rows += `<tr><td>Plica coscia</td><td>${formatPlica(pm, 'Coscia')}</td></tr>`;
  }

  document.getElementById('r-antro-rows').innerHTML = rows;
  document.getElementById('r-footer').innerHTML = `
    <p>Plicometro: GIMA DIGITALE (modello 37320)</p>
    <p>Metodo: Jackson & Pollock / ${sesso === 'M' ? 7 : 3} pliche</p>
    <p>Somma pliche (mm) = ${sommaPliche.toFixed(2).replace('.', ',')} mm</p>
  `;

  // Mostra anteprima
  document.getElementById('preview-area').style.display = 'block';
  document.getElementById('btn-pdf').scrollIntoView({ behavior: 'smooth' });
}

/* ══════════════════════════════════════════════════════════════════════════════
   15. DOWNLOAD PDF
══════════════════════════════════════════════════════════════════════════════ */
async function scaricaPDF() {
  const btn = document.getElementById('btn-pdf');
  const nominativo = document.getElementById('in-nominativo').value.trim() || 'PAZIENTE';
  
  btn.disabled = true;
  btn.textContent = '⏳ Generazione PDF...';
  
  const wraps = document.querySelectorAll('.pg-wrap');
  const vecchieTrasformazioni = [];
  const isMobile = window.innerWidth <= 820;

  wraps.forEach(el => {
    vecchieTrasformazioni.push(el.style.transform);
    el.style.transform = 'none';
  });

  if (isMobile) {
    document.querySelectorAll('.wmark').forEach(wm => {
      wm.style.setProperty('width', '502px', 'important');
    });
  }

  try {
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    const pagine = [
      document.getElementById('pdf-p1'),
      document.getElementById('pdf-p2')
    ];

    for (let i = 0; i < pagine.length; i++) {
      const canvas = await html2canvas(pagine[i], {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        width: 794,
        height: 1123,
        windowWidth: 794,
        windowHeight: 1123
      });
      const img = canvas.toDataURL('image/jpeg', 0.97);
      if (i > 0) pdf.addPage();
      pdf.addImage(img, 'JPEG', 0, 0, 210, 297);
    }

    // Nome file con dati corretti
    const nomeFile = `${nominativo} - Composizione corporea e Fabbisogni energetici.pdf`;
    pdf.save(nomeFile);
  } catch (e) {
    console.error('Errore PDF:', e);
    alert('❌ Errore nella generazione del PDF');
  }

  if (isMobile) {
    document.querySelectorAll('.wmark').forEach(wm => {
      wm.style.removeProperty('width');
    });
  }

  wraps.forEach((el, i) => {
    el.style.transform = vecchieTrasformazioni[i];
  });

  btn.disabled = false;
  btn.textContent = '📥 Scarica PDF Report';
}
