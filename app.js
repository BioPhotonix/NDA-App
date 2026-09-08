// Run after DOM is ready
function init() {

// === Theme Toggle ===
(function () {
  const toggle = document.querySelector('[data-theme-toggle]');
  const root = document.documentElement;
  let dark = matchMedia('(prefers-color-scheme: dark)').matches;
  root.setAttribute('data-theme', dark ? 'dark' : 'light');

  function updateIcon() {
    toggle.innerHTML = dark
      ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>'
      : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
    toggle.setAttribute('aria-label', 'Switch to ' + (dark ? 'light' : 'dark') + ' mode');
  }
  updateIcon();

  toggle.addEventListener('click', () => {
    dark = !dark;
    root.setAttribute('data-theme', dark ? 'dark' : 'light');
    updateIcon();
  });
})();

// === Live Preview ===
const previewInputs = document.querySelectorAll('[data-preview]');
previewInputs.forEach(input => {
  const targetId = input.dataset.preview;
  const target = document.getElementById(targetId);
  if (!target) return;
  const update = () => {
    const val = input.value.trim();
    if (targetId === 'preview-date' && val) {
      // Format date as DD/MM/YYYY — parse as local (not UTC) to avoid timezone shift
      const [yyyy, mm, dd] = val.split('-');
      const dateStr = `${dd}/${mm}/${yyyy}`;
      target.textContent = dateStr;
      // Also update the BioPhotonix date field (shared signing date)
      const bpDate = document.getElementById('preview-bp-date');
      if (bpDate) bpDate.textContent = dateStr;
    } else {
      target.textContent = val || '';
      if (!val) {
        // Restore placeholder
        const placeholders = {
          'preview-company': '[Company Name]',
          'preview-incorporation': '[Jurisdiction]',
          'preview-company-number': '[Company Number]',
          'preview-address': '[Address]',
          'preview-individual-name': '[Full Name]',
          'preview-individual-address': '[Address]',
          'preview-name': '[Name]',
          'preview-title': '[Title]',
          'preview-date': '[Date]',
          'preview-bp-date': '[Date]',
          'preview-sig': '[Signature]'
        };
        target.textContent = placeholders[targetId] || '';
      }
    }
  };
  input.addEventListener('input', update);
  input.addEventListener('change', update);
});

// Set default date to today
const dateInput = document.getElementById('signer-date');
if (dateInput) {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  dateInput.value = `${yyyy}-${mm}-${dd}`;
  dateInput.dispatchEvent(new Event('change'));
}

// === Recipient Type Toggle ===
// 'company', 'education', and 'other' all share the same field set (name /
// place of incorporation-or-establishment / number / registered address)
// but use different nouns in the clause text and form labels.
const ENTITY_TYPES = {
  company: {
    noun: 'a company',
    verb: 'incorporated in',
    numberLabel: 'company number',
    nameLabel: 'Company Name',
    incorporationLabel: 'Place of Incorporation',
    numberFieldLabel: 'Company Number',
    numberPlaceholder: 'e.g. SC123456',
    namePlaceholder: 'e.g. Acme Medical Ltd',
    incorporationPlaceholder: 'e.g. Scotland',
  },
  education: {
    noun: 'an educational institution',
    verb: 'established in',
    numberLabel: 'institution number',
    nameLabel: 'Institution Name',
    incorporationLabel: 'Place of Establishment',
    numberFieldLabel: 'Institution / Registration Number',
    numberPlaceholder: 'e.g. RC000123',
    namePlaceholder: 'e.g. University of Example',
    incorporationPlaceholder: 'e.g. England',
  },
  other: {
    noun: 'an organisation',
    verb: 'established in',
    numberLabel: 'registration number',
    nameLabel: 'Organisation Name',
    incorporationLabel: 'Place of Establishment',
    numberFieldLabel: 'Registration Number',
    numberPlaceholder: 'e.g. N/A',
    namePlaceholder: 'e.g. Example NHS Foundation Trust',
    incorporationPlaceholder: 'e.g. Scotland',
  },
};

let recipientType = 'company';
const radios = document.querySelectorAll('input[name="recipient-type"]');
const companyFields = document.getElementById('company-fields');
const individualFields = document.getElementById('individual-fields');
const companyClause = document.getElementById('recipient-clause-company');
const individualClause = document.getElementById('recipient-clause-individual');
const titleGroup = document.getElementById('title-group');
const recipientTitleRow = document.getElementById('recipient-title-row');

function applyEntityLabels(type) {
  const cfg = ENTITY_TYPES[type];
  if (!cfg) return;
  document.getElementById('label-company-name').innerHTML = `${cfg.nameLabel} <span class="required">*</span>`;
  document.getElementById('label-incorporation').innerHTML = `${cfg.incorporationLabel} <span class="required">*</span>`;
  document.getElementById('label-company-number').textContent = cfg.numberFieldLabel;
  document.getElementById('label-registered-address').innerHTML = 'Registered Office Address <span class="required">*</span>';
  document.getElementById('company-name').placeholder = cfg.namePlaceholder;
  document.getElementById('incorporation').placeholder = cfg.incorporationPlaceholder;
  document.getElementById('company-number').placeholder = cfg.numberPlaceholder;
  const nounPreview = document.getElementById('preview-entity-noun');
  const verbPreview = document.getElementById('preview-entity-verb');
  const numberLabelPreview = document.getElementById('preview-entity-number-label');
  if (nounPreview) nounPreview.textContent = cfg.noun;
  if (verbPreview) verbPreview.textContent = cfg.verb;
  if (numberLabelPreview) numberLabelPreview.textContent = cfg.numberLabel;
}

radios.forEach(radio => {
  radio.addEventListener('change', () => {
    recipientType = radio.value;
    if (recipientType === 'individual') {
      companyFields.style.display = 'none';
      individualFields.style.display = '';
      companyClause.style.display = 'none';
      individualClause.style.display = '';
      titleGroup.style.display = 'none';
      recipientTitleRow.style.display = 'none';
      // Auto-fill signer name from individual name if empty
      const indName = document.getElementById('individual-name');
      const signerName = document.getElementById('signer-name');
      if (!signerName.value && indName.value) signerName.value = indName.value;
      // Set title to 'Individual' for the preview
      const titlePreview = document.getElementById('preview-title');
      if (titlePreview) titlePreview.textContent = 'Individual';
    } else {
      companyFields.style.display = '';
      individualFields.style.display = 'none';
      companyClause.style.display = '';
      individualClause.style.display = 'none';
      titleGroup.style.display = '';
      recipientTitleRow.style.display = '';
      applyEntityLabels(recipientType);
      // Refresh the live preview text for name/number fields already filled in
      ['company-name', 'incorporation', 'company-number', 'registered-address'].forEach(id => {
        document.getElementById(id).dispatchEvent(new Event('input'));
      });
      // Restore title preview
      const titleInput = document.getElementById('signer-title');
      const titlePreview = document.getElementById('preview-title');
      if (titlePreview) titlePreview.textContent = titleInput.value || '[Title]';
    }
  });
});

// Apply default labels on load
applyEntityLabels('company');

// === Governing Law / Jurisdiction Toggle ===
const JURISDICTIONS = {
  scotland: {
    subtitle: 'Scots Law',
    tradeSecret: 'Scots law',
    governing: 'Scots law',
    courts: 'The Scottish courts',
  },
  england: {
    subtitle: 'Law of England and Wales',
    tradeSecret: 'the law of England and Wales',
    governing: 'the law of England and Wales',
    courts: 'The courts of England and Wales',
  },
};

let jurisdiction = 'scotland';

function applyJurisdiction() {
  const j = JURISDICTIONS[jurisdiction];
  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };
  set('preview-law-subtitle', j.subtitle);
  set('preview-law-tradesecret', j.tradeSecret);
  set('preview-law-governing', j.governing);
  set('preview-law-courts', j.courts);
}

document.querySelectorAll('input[name="jurisdiction"]').forEach(radio => {
  radio.addEventListener('change', () => {
    if (!radio.checked) return;
    jurisdiction = radio.value;
    applyJurisdiction();
  });
});

applyJurisdiction();

// Auto-sync individual name to signer name
const individualNameInput = document.getElementById('individual-name');
individualNameInput.addEventListener('input', () => {
  if (recipientType === 'individual') {
    document.getElementById('signer-name').value = individualNameInput.value;
    document.getElementById('signer-name').dispatchEvent(new Event('input'));
  }
});

// === Signature Pad ===
const canvas = document.getElementById('signature-canvas');
const ctx = canvas.getContext('2d');
const placeholder = document.getElementById('sig-placeholder');
let drawing = false;
let hasSignature = false;
let lastX = 0, lastY = 0;

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  // Save current drawing
  const imgData = hasSignature ? canvas.toDataURL() : null;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 2;
  ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--color-text').trim();
  // Restore
  if (imgData) {
    const img = new Image();
    img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height);
    img.src = imgData;
  }
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

function getPos(e) {
  const rect = canvas.getBoundingClientRect();
  const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
  const y = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
  return { x, y };
}

function startDraw(e) {
  e.preventDefault();
  drawing = true;
  const { x, y } = getPos(e);
  lastX = x; lastY = y;
  if (!hasSignature) {
    hasSignature = true;
    placeholder.style.display = 'none';
  }
}

function draw(e) {
  if (!drawing) return;
  e.preventDefault();
  const { x, y } = getPos(e);
  ctx.beginPath();
  ctx.moveTo(lastX, lastY);
  ctx.lineTo(x, y);
  ctx.stroke();
  lastX = x; lastY = y;
}

function stopDraw() { drawing = false; }

canvas.addEventListener('mousedown', startDraw);
canvas.addEventListener('mousemove', draw);
canvas.addEventListener('mouseup', stopDraw);
canvas.addEventListener('mouseleave', stopDraw);
canvas.addEventListener('touchstart', startDraw, { passive: false });
canvas.addEventListener('touchmove', draw, { passive: false });
canvas.addEventListener('touchend', stopDraw);

document.getElementById('clear-sig').addEventListener('click', () => {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  hasSignature = false;
  placeholder.style.display = '';
  resizeCanvas();
});

// === Signature Tabs ===
const tabs = document.querySelectorAll('[data-sig-tab]');
const drawPanel = document.getElementById('sig-draw-panel');
const typePanel = document.getElementById('sig-type-panel');

tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    tabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    const mode = tab.dataset.sigTab;
    drawPanel.style.display = mode === 'draw' ? '' : 'none';
    typePanel.style.display = mode === 'type' ? '' : 'none';
  });
});

document.getElementById('clear-typed-sig').addEventListener('click', () => {
  document.getElementById('signature-typed').value = '';
  updateTypedPreview();
});

// Update typed signature preview
const typedSigInput = document.getElementById('signature-typed');
const sigPreview = document.getElementById('preview-sig');

function updateTypedPreview() {
  const val = typedSigInput.value.trim();
  if (val && typePanel.style.display !== 'none') {
    sigPreview.textContent = val;
    sigPreview.style.fontFamily = 'var(--font-display)';
    sigPreview.style.fontStyle = 'italic';
  }
}

typedSigInput.addEventListener('input', updateTypedPreview);

// === Form Validation ===
function validateForm() {
  let required = ['signer-name', 'signer-date'];
  if (recipientType === 'individual') {
    required = ['individual-name', 'individual-address', 'signer-name', 'signer-date'];
  } else {
    // company, education, other all share the same field set
    required = ['company-name', 'incorporation', 'registered-address', 'signer-name', 'signer-title', 'signer-date'];
  }
  let valid = true;
  required.forEach(id => {
    const input = document.getElementById(id);
    const group = input.closest('.form-group');
    if (!input.value.trim()) {
      group.classList.add('has-error');
      valid = false;
    } else {
      group.classList.remove('has-error');
    }
  });

  // Check signature
  const activeTab = document.querySelector('[data-sig-tab].active').dataset.sigTab;
  let sigValid = false;
  if (activeTab === 'draw') {
    sigValid = hasSignature;
  } else {
    sigValid = typedSigInput.value.trim().length > 0;
  }
  if (!sigValid) {
    valid = false;
    // Could add error styling to signature area
  }
  return valid;
}

// Remove error on input
document.querySelectorAll('input').forEach(input => {
  input.addEventListener('input', () => {
    const group = input.closest('.form-group');
    if (group) group.classList.remove('has-error');
  });
});

// === PDF Generation ===
const { jsPDF } = window.jspdf;

document.getElementById('download-btn').addEventListener('click', () => {
  if (!validateForm()) {
    const firstError = document.querySelector('.has-error');
    if (firstError) firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  generatePDF();
});

document.getElementById('print-btn').addEventListener('click', () => {
  if (!validateForm()) {
    const firstError = document.querySelector('.has-error');
    if (firstError) firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  openPDFForPrint();
});

function buildPDF() {
  const name = document.getElementById('signer-name').value.trim();
  const dateVal = document.getElementById('signer-date').value;
  // Parse as local (not UTC) to avoid timezone shift — date input gives YYYY-MM-DD
  const [yyyy, mm, dd] = dateVal.split('-');
  const dateStr = `${dd}/${mm}/${yyyy}`;

  let recipientClause, recipientName, fileLabel;
  if (recipientType === 'individual') {
    const indName = document.getElementById('individual-name').value.trim();
    const indAddress = document.getElementById('individual-address').value.trim();
    recipientClause = `(2) ${indName}, an individual residing at ${indAddress} (the "Recipient").`;
    recipientName = indName;
    fileLabel = indName;
  } else {
    const cfg = ENTITY_TYPES[recipientType] || ENTITY_TYPES.company;
    const companyName = document.getElementById('company-name').value.trim();
    const incorporation = document.getElementById('incorporation').value.trim();
    const companyNumber = document.getElementById('company-number').value.trim() || 'N/A';
    const address = document.getElementById('registered-address').value.trim();
    recipientClause = `(2) ${companyName}, ${cfg.noun} ${cfg.verb} ${incorporation} (${cfg.numberLabel} ${companyNumber}) and having its registered office at ${address} (the "Recipient").`;
    recipientName = companyName;
    fileLabel = companyName;
  }
  const title = recipientType === 'individual' ? 'Individual' : document.getElementById('signer-title').value.trim();

  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 56; // ~2cm
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  const lineHeight = 14;
  const paraSpacing = 10;
  const headingSpacing = 18;

  function ensureSpace(needed) {
    if (y + needed > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
  }

  function addText(text, options = {}) {
    const fontSize = options.fontSize || 10;
    const fontStyle = options.fontStyle || 'normal';
    const indent = options.indent || 0;
    doc.setFont('helvetica', fontStyle);
    doc.setFontSize(fontSize);
    const lines = doc.splitTextToSize(text, contentWidth - indent);
    for (const line of lines) {
      ensureSpace(lineHeight);
      doc.text(line, margin + indent, y);
      y += lineHeight;
    }
    y += paraSpacing;
  }

  function addHeading(text, size = 12) {
    y += headingSpacing;
    ensureSpace(lineHeight * 2);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(size);
    doc.text(text, margin, y);
    y += lineHeight + 4;
  }

  function addClauseHeading(num, text) {
    y += headingSpacing;
    ensureSpace(lineHeight * 2);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(`${num}. ${text}`, margin, y);
    y += lineHeight + 4;
  }

  // Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('NON-DISCLOSURE AGREEMENT', pageWidth / 2, y, { align: 'center' });
  y += lineHeight + 4;
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(10);
  doc.text(`(Universal — ${JURISDICTIONS[jurisdiction].subtitle})`, pageWidth / 2, y, { align: 'center' });
  y += paraSpacing + headingSpacing;

  addText('This Non-Disclosure Agreement (this "Agreement") is made on the date set out below.');

  addHeading('PARTIES');
  addText('(1) BIOPHOTONIX LTD, a company incorporated in Scotland (company number SC881225) and having its registered office at Thebeyond, Skypark, 8 Elliot Street, Glasgow, G3 8EP ("BioPhotonix"); and');
  addText(recipientClause);
  addText('(BioPhotonix and the Recipient are each a "Party" and together the "Parties").');

  addHeading('BACKGROUND');
  addText('A. BioPhotonix is engaged in the development of regulated photobiomodulation devices, software, treatment methodologies, and related know-how.');
  addText('B. In connection with discussions and evaluations concerning a potential commercial, technical, regulatory, academic, or advisory relationship (the "Purpose"), it is necessary for Confidential Information (as defined below) to be disclosed.');
  addText('C. The Parties wish to protect such Confidential Information on the terms set out in this Agreement.');

  addHeading('AGREED TERMS');

  addClauseHeading('1', 'Definitions');
  addText('1.1 "Confidential Information" means any information (whether written, oral, visual, electronic, or in any other form) disclosed by or on behalf of a Party (the "Disclosing Party") to the other Party (the "Receiving Party") in connection with the Purpose which is, or ought reasonably to be regarded as, confidential.', { indent: 0 });
  addText('Confidential Information includes, without limitation:');
  addText('(a) product specifications, prototypes, devices, designs, drawings, samples, software, firmware, algorithms, data, test results, clinical or technical reports, treatment protocols, methodologies, trade secrets, and know-how;', { indent: 16 });
  addText('(b) business plans, financial information, pricing, market analysis, regulatory strategy, intellectual property strategy, and commercial arrangements;', { indent: 16 });
  addText('(c) the existence and contents of this Agreement and the fact that discussions are taking place between the Parties; and', { indent: 16 });
  addText('(d) any copies, notes, analyses, summaries, or other derivatives of the above.', { indent: 16 });

  addClauseHeading('2', 'Confidentiality Obligations');
  addText('2.1 The Receiving Party shall:');
  addText('(a) keep the Confidential Information strictly confidential and not disclose it to any third party without the prior written consent of the Disclosing Party;', { indent: 16 });
  addText('(b) use the Confidential Information solely for the Purpose and for no other purpose;', { indent: 16 });
  addText('(c) restrict access to the Confidential Information to those of its directors, officers, employees, professional advisers, or contractors who have a strict need to know for the Purpose ("Permitted Recipients"), and ensure that such persons are bound by confidentiality obligations no less protective than those in this Agreement; and', { indent: 16 });
  addText('(d) apply to the Confidential Information at least the same standard of care as it applies to its own confidential information of a similar nature, and in any event no less than a reasonable standard of care.', { indent: 16 });

  addClauseHeading('3', 'Exceptions');
  addText('3.1 The obligations in Clause 2 shall not apply to information which the Receiving Party can demonstrate:');
  addText('(a) is or becomes publicly available other than as a result of a breach of this Agreement;', { indent: 16 });
  addText('(b) was lawfully in its possession prior to disclosure by the Disclosing Party;', { indent: 16 });
  addText('(c) is lawfully received from a third party without restriction on disclosure; or', { indent: 16 });
  addText('(d) is independently developed without reference to the Confidential Information.', { indent: 16 });
  addText('3.2 Disclosure of Confidential Information may be made where required by law, court order, or regulatory authority, provided that (to the extent legally permitted) the Receiving Party gives prompt written notice to the Disclosing Party.');

  addClauseHeading('4', 'Copies and Return of Materials');
  addText('4.1 The Receiving Party may make copies of the Confidential Information only as strictly necessary for the Purpose.');
  addText('4.2 Upon written request by the Disclosing Party, the Receiving Party shall promptly:');
  addText('(a) return all Confidential Information in tangible form;', { indent: 16 });
  addText('(b) permanently erase or destroy all electronic copies; and', { indent: 16 });
  addText('(c) certify in writing its compliance with this Clause.', { indent: 16 });

  addClauseHeading('5', 'No Licence or Warranty');
  addText("5.1 Nothing in this Agreement grants the Receiving Party any licence, right, or interest in the Disclosing Party's intellectual property.");
  addText('5.2 All Confidential Information is provided "as is" without warranty as to accuracy or completeness.');

  addClauseHeading('6', 'Trade Secrets');
  addText(`Notwithstanding any other provision of this Agreement, Confidential Information which constitutes a trade secret shall remain protected for so long as it retains its status as a trade secret under ${JURISDICTIONS[jurisdiction].tradeSecret}.`);

  addClauseHeading('7', 'No Reverse Engineering');
  addText('The Receiving Party shall not, and shall ensure that its Permitted Recipients do not, directly or indirectly reverse engineer, decompile, disassemble, or otherwise attempt to derive the composition, structure, design, firmware behaviour, software logic, or underlying ideas of any Confidential Information, prototype, device, or material disclosed under this Agreement.');

  addClauseHeading('8', 'No Clinical or Patient Use');
  addText('The Receiving Party acknowledges that all devices, protocols, and materials disclosed are provided solely for evaluation and discussion purposes. The Receiving Party shall not use, test, trial, deploy, or apply any Confidential Information in or on human subjects, patients, or clinical settings, nor submit the same for ethical approval, clinical investigation, or experimental use, without the prior written consent of the Disclosing Party.');

  addClauseHeading('9', 'Regulatory Restrictions');
  addText('The Receiving Party shall not submit or disclose Confidential Information to any regulatory authority, notified body, conformity assessment body, ethics committee or standards organisation without the prior written consent of the Disclosing Party, except where such disclosure is expressly within the agreed scope of services between the Parties or otherwise required by law.');

  addClauseHeading('10', 'Non-Circumvention');
  addText('Neither Party shall knowingly use Confidential Information disclosed by the other Party for the principal purpose of circumventing the Disclosing Party in relation to a specific commercial opportunity introduced by the Disclosing Party in connection with the Purpose. This restriction shall not apply to any person or organisation with whom the Receiving Party had a pre-existing relationship, of whom it was independently aware, or with whom it subsequently establishes contact independently of the Confidential Information.');

  addClauseHeading('11', 'No Publicity');
  addText('The Receiving Party shall not make any public announcement or disclosure regarding this Agreement, the Confidential Information, or the discussions between the Parties without the prior written consent of the Disclosing Party.');

  addClauseHeading('12', 'Term and Survival');
  addText('12.1 This Agreement shall commence on the date first written above and shall continue for five (5) years unless terminated earlier by mutual written agreement.');
  addText('12.2 The confidentiality and non-use obligations shall survive expiry or termination for five (5) years from the date of disclosure, or for so long as the Confidential Information remains confidential, whichever is longer.');

  addClauseHeading('13', 'Assignment');
  addText('Neither Party may assign or transfer its rights or obligations under this Agreement without the prior written consent of the other Party.');

  addClauseHeading('14', 'Remedies');
  addText('The Receiving Party acknowledges that damages alone may be an inadequate remedy for breach of this Agreement and that the Disclosing Party shall be entitled to seek injunctive or equitable relief.');

  addClauseHeading('15', 'Entire Agreement and Variation');
  addText('This Agreement constitutes the entire agreement between the Parties in relation to its subject matter. Any variation must be in writing and signed by authorised representatives of both Parties.');

  addClauseHeading('16', 'Counterparts');
  addText('This Agreement may be executed in counterparts. Electronic signatures shall be legally effective.');

  addClauseHeading('17', 'Governing Law and Jurisdiction');
  addText(`This Agreement and any dispute or claim (including non-contractual disputes or claims) arising out of or in connection with it shall be governed by and construed in accordance with ${JURISDICTIONS[jurisdiction].governing}. ${JURISDICTIONS[jurisdiction].courts} shall have exclusive jurisdiction.`);

  // Signature blocks
  addHeading('SIGNED');

  addText('For and on behalf of BioPhotonix', { fontStyle: 'bold' });

  // BioPhotonix signature: use the baked-in signature image
  ensureSpace(60);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text('Signature:', margin, y + 20);
  if (bakedSignatureDataUrl) {
    // Preserve aspect ratio (original ~260x90)
    const sigW = 130;
    const sigH = 45;
    doc.addImage(bakedSignatureDataUrl, 'PNG', margin + 60, y - 5, sigW, sigH);
    y += sigH + 5;
  } else {
    doc.text('Adail Islam', margin + 60, y + 20);
    y += lineHeight;
  }
  addText('Name: Adail Islam');
  addText('Title: Director / CEO');
  addText(`Date: ${dateStr}`);

  y += paraSpacing;
  addText('For and on behalf of the Recipient', { fontStyle: 'bold' });

  // Add signature image
  const activeTab = document.querySelector('[data-sig-tab].active').dataset.sigTab;
  let sigAdded = false;

  if (activeTab === 'draw' && hasSignature) {
    // Get signature image — trim whitespace
    const sigData = getTrimmedSignature();
    if (sigData) {
      ensureSpace(80);
      const sigWidth = 200;
      const sigHeight = 60;
      doc.addImage(sigData, 'PNG', margin, y, sigWidth, sigHeight);
      y += sigHeight + 4;
      sigAdded = true;
    }
  } else if (activeTab === 'type') {
    const typedSig = typedSigInput.value.trim();
    if (typedSig) {
      ensureSpace(lineHeight + 20);
      doc.setFont('times', 'italic');
      doc.setFontSize(24);
      doc.text(typedSig, margin, y + 20);
      y += 40;
      sigAdded = true;
    }
  }

  if (!sigAdded) {
    addText('Signature: ____________________________');
  }

  addText(`Name: ${name}`);
  if (recipientType !== 'individual') {
    addText(`Title: ${title}`);
  }
  addText(`Date: ${dateStr}`);

  const filename = `NDA_${fileLabel.replace(/[^a-zA-Z0-9]/g, '_')}_${dateStr.replace(/\//g, '-')}.pdf`;
  return { doc, filename, recipientName, name };
}

function generatePDF() {
  const result = buildPDF();
  if (!result) return;
  const { doc, filename } = result;
  doc.save(filename);

  // Show success
  const banner = document.getElementById('success-banner');
  const successMsg = document.getElementById('success-message');
  banner.classList.add('show');
  successMsg.textContent = 'NDA downloaded. Please send the completed PDF to Adail Islam at BioPhotonix to proceed.';
  banner.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// Build the PDF and open it in a new tab for printing
function openPDFForPrint() {
  const result = buildPDF();
  if (!result) return;
  const { doc, filename } = result;
  // Try to open PDF in a new tab for printing; fall back to download if blocked
  const blob = doc.output('blob');
  const url = URL.createObjectURL(blob);
  const newTab = window.open(url, '_blank');

  // Show success
  const banner = document.getElementById('success-banner');
  const successMsg = document.getElementById('success-message');
  banner.classList.add('show');

  if (newTab) {
    successMsg.textContent = 'NDA opened in a new tab. Use your browser print or save option from there.';
  } else {
    // Pop-up was blocked — download the PDF instead so the user can open/print it manually
    doc.save(filename);
    successMsg.textContent = 'Your browser blocked opening a new tab. The NDA has been downloaded instead — open it to print or save.';
  }
  banner.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// Trim signature canvas to content
function getTrimmedSignature() {
  const canvasWidth = canvas.width;
  const canvasHeight = canvas.height;
  const imageData = ctx.getImageData(0, 0, canvasWidth, canvasHeight);
  const data = imageData.data;

  let minX = canvasWidth, minY = canvasHeight, maxX = 0, maxY = 0;
  let found = false;

  for (let y = 0; y < canvasHeight; y++) {
    for (let x = 0; x < canvasWidth; x++) {
      const idx = (y * canvasWidth + x) * 4;
      const alpha = data[idx + 3];
      if (alpha > 10) {
        found = true;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (!found) return null;

  const padding = 10;
  minX = Math.max(0, minX - padding);
  minY = Math.max(0, minY - padding);
  maxX = Math.min(canvasWidth, maxX + padding);
  maxY = Math.min(canvasHeight, maxY + padding);

  const trimWidth = maxX - minX;
  const trimHeight = maxY - minY;

  const trimmedCanvas = document.createElement('canvas');
  trimmedCanvas.width = trimWidth;
  trimmedCanvas.height = trimHeight;
  const trimmedCtx = trimmedCanvas.getContext('2d');
  trimmedCtx.drawImage(canvas, minX, minY, trimWidth, trimHeight, 0, 0, trimWidth, trimHeight);

  return trimmedCanvas.toDataURL('image/png');
}

// === Baked-in BioPhotonix signature ===
// Loaded from adail-signature.png on page load, converted to data URL for jsPDF.
let bakedSignatureDataUrl = null;

fetch('adail-signature.png')
  .then(r => r.blob())
  .then(blob => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  }))
  .then(dataUrl => {
    bakedSignatureDataUrl = dataUrl;
  })
  .catch(err => {
    console.warn('Could not load baked signature:', err);
  });

} // end init()

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
