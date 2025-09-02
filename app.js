// App: Absensi Siswa QR • Firebase Realtime DB
(function () {
  'use strict';

  // ---------- Utilities ----------
  function byId(id) { return document.getElementById(id); }
  function qs(sel) { return document.querySelector(sel); }
  function qsa(sel) { return Array.from(document.querySelectorAll(sel)); }

  function formatDateInputValue(dateObj) {
    const yyyy = dateObj.getFullYear();
    const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
    const dd = String(dateObj.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  function showToast(message) {
    console.log(message);
    // For simplicity, log to scan-log when available
    const log = byId('scan-log');
    if (log) {
      const p = document.createElement('div');
      p.textContent = message;
      log.prepend(p);
    }
  }

  // ---------- Tabs ----------
  function initTabs() {
    qsa('.tab-button').forEach(btn => {
      btn.addEventListener('click', () => {
        qsa('.tab-button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const target = btn.getAttribute('data-target');
        qsa('.tab-panel').forEach(p => p.classList.remove('active'));
        qs(target).classList.add('active');
      });
    });
  }

  // ---------- Firebase ----------
  let app = null;
  let db = null;
  function initFirebase() {
    const cfg = window.FIREBASE_CONFIG;
    if (!cfg || !cfg.apiKey) {
      alert('Konfigurasi Firebase belum diisi. Edit window.FIREBASE_CONFIG di index.html.');
      return;
    }
    app = firebase.initializeApp(cfg);
    db = firebase.database();
  }

  // ---------- State ----------
  const state = {
    kelasList: [],
    currentRekapRows: [],
    html5Qr: null,
    recentScanMemory: new Map(), // key: uniqueId, value: timestamp ms
  };

  // ---------- Kelas & Siswa ----------
  function sanitizeKey(raw) {
    return (raw || '').trim();
  }

  function subscribeKelasList() {
    db.ref('kelas').on('value', snap => {
      const data = snap.val() || {};
      state.kelasList = Object.keys(data).sort();
      refreshAllKelasSelects();
      // If any tab has selected kelas empty, set to first
      const selects = [
        byId('select-kelas'), byId('select-kelas-qr'), byId('select-kelas-scan'), byId('select-kelas-rekap')
      ];
      selects.forEach(sel => {
        if (sel && !sel.value && state.kelasList.length > 0) {
          sel.value = state.kelasList[0];
        }
      });
      // Refresh siswa list for main tab
      const selectedKelas = byId('select-kelas')?.value || '';
      if (selectedKelas) {
        loadAndRenderSiswaList(selectedKelas);
      } else {
        byId('list-siswa').innerHTML = '';
      }
    });
  }

  function refreshAllKelasSelects() {
    const optionsHtml = ['<option value="">Pilih kelas...</option>']
      .concat(state.kelasList.map(k => `<option value="${k}">${k}</option>`))
      .join('');
    ['select-kelas','select-kelas-qr','select-kelas-scan','select-kelas-rekap'].forEach(id => {
      const sel = byId(id);
      if (sel) sel.innerHTML = optionsHtml;
    });
  }

  function addKelas() {
    const kelasName = sanitizeKey(byId('input-kelas').value);
    if (!kelasName) { alert('Nama kelas tidak boleh kosong'); return; }
    db.ref(`kelas/${kelasName}`).update({ createdAt: firebase.database.ServerValue.TIMESTAMP })
      .then(() => { byId('input-kelas').value = ''; showToast(`Kelas ${kelasName} ditambahkan`); })
      .catch(err => alert(err.message));
  }

  function deleteKelas() {
    const kelasName = byId('select-kelas').value;
    if (!kelasName) { alert('Pilih kelas terlebih dahulu'); return; }
    if (!confirm(`Hapus kelas ${kelasName} beserta semua data?`)) return;
    db.ref(`kelas/${kelasName}`).remove()
      .then(() => showToast(`Kelas ${kelasName} dihapus`))
      .catch(err => alert(err.message));
  }

  function addOrUpdateSiswa() {
    const kelasName = byId('select-kelas').value;
    const nomor = sanitizeKey(byId('input-nomor').value);
    const nama = sanitizeKey(byId('input-nama').value);
    if (!kelasName) { alert('Pilih kelas terlebih dahulu'); return; }
    if (!nomor || !nama) { alert('Nomor dan Nama siswa wajib diisi'); return; }
    const siswa = { nama, nomor };
    db.ref(`kelas/${kelasName}/siswa/${nomor}`).set(siswa)
      .then(() => {
        byId('input-nomor').value = '';
        byId('input-nama').value = '';
        showToast(`Siswa ${nama} (${nomor}) disimpan`);
      })
      .catch(err => alert(err.message));
  }

  function removeSiswa(kelasName, nomor, nama) {
    if (!confirm(`Hapus siswa ${nama} (${nomor}) dari ${kelasName}?`)) return;
    db.ref(`kelas/${kelasName}/siswa/${nomor}`).remove()
      .then(() => showToast(`Siswa ${nama} (${nomor}) dihapus`))
      .catch(err => alert(err.message));
  }

  let siswaListUnsub = null;
  function loadAndRenderSiswaList(kelasName) {
    if (siswaListUnsub) { db.ref(`kelas/${siswaListUnsub}`).off(); }
    siswaListUnsub = `${kelasName}/siswa`;
    db.ref(`kelas/${kelasName}/siswa`).on('value', snap => {
      const data = snap.val() || {};
      const list = Object.values(data).sort((a, b) => String(a.nomor).localeCompare(String(b.nomor)));
      const container = byId('list-siswa');
      container.innerHTML = '';
      list.forEach(s => {
        const item = document.createElement('div');
        item.className = 'list-item';
        const left = document.createElement('div');
        left.innerHTML = `<div><strong>${s.nomor}</strong> · ${s.nama}</div>` +
          `<div class="meta">${kelasName}</div>`;
        const right = document.createElement('div');
        const delBtn = document.createElement('button');
        delBtn.className = 'btn danger';
        delBtn.textContent = 'Hapus';
        delBtn.addEventListener('click', () => removeSiswa(kelasName, s.nomor, s.nama));
        right.appendChild(delBtn);
        item.appendChild(left);
        item.appendChild(right);
        container.appendChild(item);
      });
    });
  }

  // ---------- Generate QR ----------
  let currentQrInstance = null;
  let currentQrData = null;

  function openQrModalForStudent(kelasName, siswa) {
    const payload = {
      v: 1,
      jenis: 'absensi-siswa',
      kelas: kelasName,
      nomor: String(siswa.nomor),
      nama: String(siswa.nama),
      uid: `${kelasName}|${siswa.nomor}`
    };
    currentQrData = payload;

    const modal = byId('qr-modal');
    byId('qr-title').textContent = `${kelasName} • ${siswa.nomor} • ${siswa.nama}`;
    const preview = byId('qr-preview');
    preview.innerHTML = '';
    if (currentQrInstance && currentQrInstance.clear) currentQrInstance.clear();
    currentQrInstance = new QRCode(preview, {
      text: JSON.stringify(payload),
      width: 256,
      height: 256,
      colorDark: "#000000",
      colorLight: "#ffffff",
      correctLevel: QRCode.CorrectLevel.M
    });
    modal.classList.remove('hidden');
  }

  function closeQrModal() {
    const modal = byId('qr-modal');
    modal.classList.add('hidden');
  }

  function downloadCurrentQr() {
    const preview = byId('qr-preview');
    // QRCode.js appends <img> or <canvas>
    const img = preview.querySelector('img');
    const canvas = preview.querySelector('canvas');
    let dataUrl = null;
    if (canvas) dataUrl = canvas.toDataURL('image/png');
    if (!dataUrl && img) dataUrl = img.src;
    if (!dataUrl) { alert('QR belum siap'); return; }
    const a = document.createElement('a');
    const fileName = `${currentQrData.kelas}-${currentQrData.nomor}-${currentQrData.nama}.png`;
    a.href = dataUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  function loadSiswaForQr() {
    const kelasName = byId('select-kelas-qr').value;
    const container = byId('list-siswa-qr');
    container.innerHTML = '';
    if (!kelasName) { container.innerHTML = '<div class="meta">Pilih kelas</div>'; return; }
    db.ref(`kelas/${kelasName}/siswa`).once('value').then(snap => {
      const data = snap.val() || {};
      const list = Object.values(data).sort((a, b) => String(a.nomor).localeCompare(String(b.nomor)));
      list.forEach(s => {
        const item = document.createElement('div');
        item.className = 'list-item';
        const left = document.createElement('div');
        left.innerHTML = `<div><strong>${s.nomor}</strong> · ${s.nama}</div>` +
          `<div class="meta">${kelasName}</div>`;
        const right = document.createElement('div');
        const genBtn = document.createElement('button');
        genBtn.className = 'btn primary';
        genBtn.textContent = 'QR';
        genBtn.addEventListener('click', () => openQrModalForStudent(kelasName, s));
        right.appendChild(genBtn);
        item.appendChild(left);
        item.appendChild(right);
        container.appendChild(item);
      });
    });
  }

  // ---------- Scan Absensi ----------
  function getSelectedScanContext() {
    const kelas = byId('select-kelas-scan').value;
    const mapel = sanitizeKey(byId('input-mapel').value);
    const tanggal = byId('input-tanggal').value || formatDateInputValue(new Date());
    return { kelas, mapel, tanggal };
  }

  function isDuplicateRecentScan(uniqueId) {
    const now = Date.now();
    // purge old entries > 30s
    for (const [k, t] of state.recentScanMemory) {
      if (now - t > 30000) state.recentScanMemory.delete(k);
    }
    if (state.recentScanMemory.has(uniqueId)) return true;
    state.recentScanMemory.set(uniqueId, now);
    return false;
  }

  async function handleScanSuccess(decodedText) {
    try {
      const data = JSON.parse(decodedText);
      if (!data || data.jenis !== 'absensi-siswa') { showToast('QR tidak valid'); return; }
      const { kelas, mapel, tanggal } = getSelectedScanContext();
      if (!kelas) { showToast('Pilih kelas terlebih dahulu'); return; }
      if (!byId('input-mapel').value) { showToast('Isi mata pelajaran'); return; }
      if (data.kelas !== kelas) { showToast(`QR milik kelas ${data.kelas}, bukan ${kelas}`); return; }

      const uniqueId = data.uid || `${data.kelas}|${data.nomor}`;
      if (isDuplicateRecentScan(uniqueId)) {
        showToast(`Duplikat scan untuk ${data.nama} (${data.nomor})`);
        return;
      }

      const ref = db.ref(`absensi/${kelas}/${tanggal}/${mapel}/${data.nomor}`);
      const existing = (await ref.get()).val();
      if (existing && existing.status === 'Hadir') {
        showToast(`Sudah tercatat: ${data.nama} (${data.nomor})`);
        return;
      }
      const timestamp = new Date().toISOString();
      await ref.set({ nama: data.nama, timestamp, status: 'Hadir' });
      showToast(`Hadir: ${data.nama} (${data.nomor}) • ${mapel}`);
    } catch (e) {
      showToast('Gagal membaca QR');
      console.error(e);
    }
  }

  async function startScan() {
    const { kelas, mapel } = getSelectedScanContext();
    if (!kelas) { alert('Pilih kelas'); return; }
    if (!mapel) { alert('Isi mata pelajaran'); return; }
    if (!state.html5Qr) state.html5Qr = new Html5Qrcode('qr-reader');
    try {
      await state.html5Qr.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        handleScanSuccess,
        (err) => {}
      );
      byId('btn-start-scan').disabled = true;
      byId('btn-stop-scan').disabled = false;
    } catch (e) {
      alert('Tidak dapat mengakses kamera: ' + e.message);
    }
  }

  async function stopScan() {
    if (state.html5Qr) {
      try { await state.html5Qr.stop(); } catch (_) {}
      try { await state.html5Qr.clear(); } catch (_) {}
    }
    byId('btn-start-scan').disabled = false;
    byId('btn-stop-scan').disabled = true;
  }

  // ---------- Rekap & Export ----------
  async function loadRekap() {
    const kelas = byId('select-kelas-rekap').value;
    const tanggal = byId('input-tanggal-rekap').value || formatDateInputValue(new Date());
    const mapel = sanitizeKey(byId('input-mapel-rekap').value);
    if (!kelas) { alert('Pilih kelas'); return; }

    // Fetch siswa
    const siswaSnap = await db.ref(`kelas/${kelas}/siswa`).get();
    const siswaData = siswaSnap.val() || {};
    const siswaList = Object.values(siswaData).sort((a, b) => String(a.nomor).localeCompare(String(b.nomor)));

    // Fetch absensi per filter
    let absensiData = {};
    if (mapel) {
      absensiData[mapel] = (await db.ref(`absensi/${kelas}/${tanggal}/${mapel}`).get()).val() || {};
    } else {
      const daySnap = await db.ref(`absensi/${kelas}/${tanggal}`).get();
      const dayData = daySnap.val() || {};
      absensiData = dayData; // { mapel: { nomor: {..} } }
    }

    // Build rows
    const rows = [];
    if (mapel) {
      const presentMap = absensiData[mapel] || {};
      siswaList.forEach(s => {
        const rec = presentMap[s.nomor];
        rows.push({
          'Tanggal': tanggal,
          'Mata Pelajaran': mapel,
          'Nomor Siswa': s.nomor,
          'Nama Siswa': s.nama,
          'Status Kehadiran': rec ? 'Hadir' : 'Tidak Hadir',
          'Timestamp': rec?.timestamp || ''
        });
      });
    } else {
      // For each subject present that day, add rows for hadir; also include not-present students as Tidak Hadir with blank mapel
      const mapels = Object.keys(absensiData).sort();
      // Rows for hadir
      mapels.forEach(m => {
        const presentMap = absensiData[m] || {};
        Object.entries(presentMap).forEach(([nomor, rec]) => {
          const nama = siswaData[nomor]?.nama || rec.nama || '';
          rows.push({
            'Tanggal': tanggal,
            'Mata Pelajaran': m,
            'Nomor Siswa': nomor,
            'Nama Siswa': nama,
            'Status Kehadiran': 'Hadir',
            'Timestamp': rec?.timestamp || ''
          });
        });
      });
      // Rows untuk siswa tidak hadir pada semua mapel (jika tidak ada mapel filter)
      const nomorHadirSet = new Set(rows.filter(r => r['Status Kehadiran']==='Hadir').map(r => r['Nomor Siswa']));
      siswaList.forEach(s => {
        if (!nomorHadirSet.has(String(s.nomor))) {
          rows.push({
            'Tanggal': tanggal,
            'Mata Pelajaran': '',
            'Nomor Siswa': s.nomor,
            'Nama Siswa': s.nama,
            'Status Kehadiran': 'Tidak Hadir',
            'Timestamp': ''
          });
        }
      });
    }

    state.currentRekapRows = rows;
    renderRekapTable(rows);
  }

  function renderRekapTable(rows) {
    const container = byId('rekap-container');
    if (!rows || rows.length === 0) { container.innerHTML = '<div class="meta">Belum ada data</div>'; return; }
    const headers = ['Tanggal','Mata Pelajaran','Nomor Siswa','Nama Siswa','Status Kehadiran','Timestamp'];
    const thead = `<thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>`;
    const tbody = `<tbody>${rows.map(r => `<tr>${headers.map(h => `<td>${(r[h] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody>`;
    container.innerHTML = `<table>${thead}${tbody}</table>`;
  }

  function exportToExcel() {
    const rows = state.currentRekapRows || [];
    if (!rows.length) { alert('Tidak ada data untuk diexport'); return; }
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Rekap');
    const kelas = byId('select-kelas-rekap').value || 'kelas';
    const tanggal = byId('input-tanggal-rekap').value || formatDateInputValue(new Date());
    const mapel = sanitizeKey(byId('input-mapel-rekap').value) || 'all';
    const filename = `rekap-${kelas}-${tanggal}-${mapel}.xlsx`;
    XLSX.writeFile(wb, filename);
  }

  // ---------- Event Wiring ----------
  function initEvents() {
    // Kelas & Siswa
    byId('btn-add-kelas').addEventListener('click', addKelas);
    byId('btn-delete-kelas').addEventListener('click', deleteKelas);
    byId('select-kelas').addEventListener('change', (e) => {
      const kelas = e.target.value;
      if (kelas) loadAndRenderSiswaList(kelas); else byId('list-siswa').innerHTML = '';
    });
    byId('btn-add-siswa').addEventListener('click', addOrUpdateSiswa);

    // Generate QR
    byId('btn-refresh-siswa-qr').addEventListener('click', loadSiswaForQr);
    byId('select-kelas-qr').addEventListener('change', loadSiswaForQr);
    byId('btn-close-modal').addEventListener('click', closeQrModal);
    byId('btn-download-qr').addEventListener('click', downloadCurrentQr);

    // Scan
    byId('btn-start-scan').addEventListener('click', startScan);
    byId('btn-stop-scan').addEventListener('click', stopScan);

    // Rekap & Export
    byId('btn-load-rekap').addEventListener('click', loadRekap);
    byId('btn-export-xlsx').addEventListener('click', exportToExcel);

    // Defaults
    const today = formatDateInputValue(new Date());
    byId('input-tanggal').value = today;
    byId('input-tanggal-rekap').value = today;
  }

  // ---------- Bootstrap ----------
  window.addEventListener('DOMContentLoaded', () => {
    initTabs();
    initFirebase();
    if (!db) return;
    initEvents();
    subscribeKelasList();
  });
})();

