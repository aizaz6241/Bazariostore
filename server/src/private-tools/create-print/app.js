// ==========================================================================
// Bazario Withdrawal Details - Interactive Script
// ==========================================================================

document.addEventListener('DOMContentLoaded', () => {
  // Elements - Display
  const displayPlatform = document.getElementById('displayPlatform');
  const displayAmount = document.getElementById('displayAmount');
  const displayCoin = document.getElementById('displayCoin');
  const displayStatus = document.getElementById('displayStatus');
  const statusIcon = document.getElementById('statusIcon');
  const displayNetwork = document.getElementById('displayNetwork');
  const displayAddress = document.getElementById('displayAddress');
  const displayTxidType = document.getElementById('displayTxidType');
  const displayTxid = document.getElementById('displayTxid');
  const displayRowAmount = document.getElementById('displayRowAmount');
  const displayFee = document.getElementById('displayFee');
  const displayWallet = document.getElementById('displayWallet');
  const displayDate = document.getElementById('displayDate');

  // Elements - Inputs
  const inputPlatform = document.getElementById('inputPlatform');
  const inputAmount = document.getElementById('inputAmount');
  const inputCoin = document.getElementById('inputCoin');
  const inputStatus = document.getElementById('inputStatus');
  const inputNetwork = document.getElementById('inputNetwork');
  const inputAddress = document.getElementById('inputAddress');
  const inputTxidType = document.getElementById('inputTxidType');
  const inputTxid = document.getElementById('inputTxid');
  const inputFee = document.getElementById('inputFee');
  const inputWallet = document.getElementById('inputWallet');
  const inputDateTimePicker = document.getElementById('inputDateTimePicker');
  const btnSetNow = document.getElementById('btnSetNow');
  const istLiveDisplay = document.getElementById('istLiveDisplay');
  const btnApplyIst = document.getElementById('btnApplyIst');

  // Buttons & UI
  const controlPanel = document.getElementById('controlPanel');
  const togglePanelBtn = document.getElementById('togglePanelBtn');
  const openPanelFab = document.getElementById('openPanelFab');
  const resetBtn = document.getElementById('resetBtn');
  const downloadJpgBtn = document.getElementById('downloadJpgBtn');
  const copyAddressBtn = document.getElementById('copyAddressBtn');
  const copyTxidBtn = document.getElementById('copyTxidBtn');
  const toast = document.getElementById('toast');
  const captureArea = document.getElementById('captureArea');

  // Default values
  const defaultValues = {
    platform: 'Bazario',
    amount: '32.00',
    coin: 'USDT',
    status: 'Completed',
    network: 'TRX',
    address: 'TDwPM4PMTdDOaBgNEeewofJ424fxjFHMXc',
    txidType: 'Off-chain Transfer',
    txid: '08278903801234',
    fee: '0 USDT',
    wallet: 'Spot Wallet',
    dateTimeLocal: '2026-10-30T11:46:17'
  };

  // Convert YYYY-MM-DDTHH:mm[:ss] into YYYY-MM-DD-HH:mm:ss for reference card
  function formatPickerValue(val) {
    if (!val) return '2026-10-30-11:46:17';
    const parts = val.split('T');
    if (parts.length !== 2) return val;
    let time = parts[1];
    if (time.length === 5) {
      time += ':00'; // add seconds if missing
    }
    return `${parts[0]}-${time}`;
  }

  // Format Address with line break for visual match
  function formatAddressDisplay(addr) {
    if (!addr) return '';
    if (addr.length > 22 && !addr.includes('\n')) {
      return `${addr.substring(0, 22)}<br>${addr.substring(22)}`;
    }
    return addr.replace(/\n/g, '<br>');
  }

  // Update Preview from Inputs
  function updatePreview() {
    const platform = inputPlatform.value.trim() || 'Bazario';
    const amount = inputAmount.value.trim() || '0.00';
    const coin = inputCoin.value.trim() || 'USDT';
    const status = inputStatus.value;
    const network = inputNetwork.value.trim() || 'TRX';
    const address = inputAddress.value.trim();
    const txidType = inputTxidType.value.trim() || 'TxID';
    const txid = inputTxid.value.trim();
    const fee = inputFee.value.trim() || '0 USDT';
    const wallet = inputWallet.value.trim() || 'Spot Wallet';
    const formattedDate = formatPickerValue(inputDateTimePicker.value);

    displayPlatform.textContent = platform;
    displayAmount.textContent = amount;
    displayCoin.textContent = coin;
    displayRowAmount.textContent = `${amount} ${coin}`;
    displayNetwork.textContent = network;
    displayAddress.innerHTML = formatAddressDisplay(address);
    displayTxidType.textContent = txidType;
    displayTxid.textContent = txid;
    displayFee.textContent = fee;
    displayWallet.textContent = wallet;
    displayDate.textContent = formattedDate;

    // Status styling
    displayStatus.textContent = status;
    if (status === 'Completed') {
      displayStatus.style.color = '#0aab81';
      statusIcon.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="#0aab81">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
        </svg>
      `;
    } else if (status === 'Processing') {
      displayStatus.style.color = '#cba93e';
      statusIcon.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="#cba93e">
          <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm1 14h-2v-2h2zm0-4h-2V7h2z"/>
        </svg>
      `;
    } else {
      displayStatus.style.color = '#F6465D';
      statusIcon.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="#F6465D">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.3 14.3a1 1 0 0 1-1.4 0L12 13.4l-2.9 2.9a1 1 0 1 1-1.4-1.4l2.9-2.9-2.9-2.9a1 1 0 0 1 1.4-1.4l2.9 2.9 2.9-2.9a1 1 0 0 1 1.4 1.4L13.4 12l2.9 2.9a1 1 0 0 1 0 1.4z"/>
        </svg>
      `;
    }
  }

  // Toast Function
  let toastTimer = null;
  function showToast(message) {
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove('show');
    }, 2400);
  }

  // Clipboard copy helper
  function copyToClipboard(text, successMsg) {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(() => {
        showToast(successMsg);
      }).catch(() => {
        fallbackCopy(text, successMsg);
      });
    } else {
      fallbackCopy(text, successMsg);
    }
  }

  function fallbackCopy(text, successMsg) {
    const tempInput = document.createElement('textarea');
    tempInput.value = text;
    tempInput.style.position = 'fixed';
    tempInput.style.opacity = '0';
    document.body.appendChild(tempInput);
    tempInput.select();
    try {
      document.execCommand('copy');
      showToast(successMsg);
    } catch (e) {
      showToast('Unable to copy');
    }
    document.body.removeChild(tempInput);
  }

  // Copy events
  copyAddressBtn.addEventListener('click', () => {
    const rawAddress = inputAddress.value.trim().replace(/\n/g, '');
    copyToClipboard(rawAddress, 'Address copied to clipboard');
  });

  copyTxidBtn.addEventListener('click', () => {
    const rawTxid = inputTxid.value.trim();
    copyToClipboard(rawTxid, 'TxID copied to clipboard');
  });

  // Panel collapse/expand
  togglePanelBtn.addEventListener('click', () => {
    controlPanel.classList.add('collapsed');
    openPanelFab.classList.remove('hidden');
  });

  openPanelFab.addEventListener('click', () => {
    controlPanel.classList.remove('collapsed');
    openPanelFab.classList.add('hidden');
  });

  // ========================================================================
  // India Time (IST) 12-Hour Clock & Helpers
  // ========================================================================
  function getIndiaTimeParts24() {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
    const parts = formatter.formatToParts(now);
    const getPart = (type) => parts.find(p => p.type === type)?.value || '00';
    return {
      year: getPart('year'),
      month: getPart('month'),
      day: getPart('day'),
      hour: getPart('hour'),
      minute: getPart('minute'),
      second: getPart('second')
    };
  }

  function updateIndiaClock() {
    if (!istLiveDisplay) return;
    const now = new Date();
    // 12-hour format with AM/PM
    const formatter12 = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
    const parts = formatter12.formatToParts(now);
    const get = (type) => parts.find(p => p.type === type)?.value || '';
    const dayPeriod = get('dayPeriod').toUpperCase();
    istLiveDisplay.textContent = `${get('year')}-${get('month')}-${get('day')}  ${get('hour')}:${get('minute')}:${get('second')} ${dayPeriod}`;
  }

  // Initialize clock and tick every second
  updateIndiaClock();
  setInterval(updateIndiaClock, 1000);

  // Apply India Current Time to Picker
  if (btnApplyIst) {
    btnApplyIst.addEventListener('click', () => {
      const p = getIndiaTimeParts24();
      const isoLocal = `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
      inputDateTimePicker.value = isoLocal;
      updatePreview();
      showToast('Applied India Time (IST)');
    });
  }

  // Set Local Current Time to Picker
  if (btnSetNow) {
    btnSetNow.addEventListener('click', () => {
      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const isoLocal = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
      inputDateTimePicker.value = isoLocal;
      updatePreview();
      showToast('Updated to current date & time');
    });
  }

  // When date/time is selected in the picker
  inputDateTimePicker.value = defaultValues.dateTimeLocal;
  inputDateTimePicker.addEventListener('input', updatePreview);
  inputDateTimePicker.addEventListener('change', updatePreview);

  // Reset to default
  resetBtn.addEventListener('click', () => {
    inputPlatform.value = defaultValues.platform;
    inputAmount.value = defaultValues.amount;
    inputCoin.value = defaultValues.coin;
    inputStatus.value = defaultValues.status;
    inputNetwork.value = defaultValues.network;
    inputAddress.value = defaultValues.address;
    inputTxidType.value = defaultValues.txidType;
    inputTxid.value = defaultValues.txid;
    inputFee.value = defaultValues.fee;
    inputWallet.value = defaultValues.wallet;
    inputDateTimePicker.value = defaultValues.dateTimeLocal;
    updatePreview();
    showToast('Reset to original values');
  });

  // Download JPG directly via html2canvas
  downloadJpgBtn.addEventListener('click', async () => {
    const originalText = downloadJpgBtn.innerHTML;
    downloadJpgBtn.disabled = true;
    downloadJpgBtn.innerHTML = `
      <svg class="spin-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="12" y1="2" x2="12" y2="6"></line>
        <line x1="12" y1="18" x2="12" y2="22"></line>
        <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line>
        <line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line>
        <line x1="2" y1="12" x2="6" y2="12"></line>
        <line x1="18" y1="12" x2="22" y2="12"></line>
        <line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line>
        <line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line>
      </svg>
      Generating JPG...
    `;

    try {
      if (typeof html2canvas === 'undefined') {
        throw new Error('html2canvas not loaded');
      }

      // Render high-resolution canvas matching exact background
      const canvas = await html2canvas(captureArea, {
        scale: 3,                  // Ultra-crisp high DPI rendering
        backgroundColor: '#1d2731', // Exact bluish-slate background
        useCORS: true,
        logging: false
      });

      // Convert directly to high quality JPEG
      const jpegDataUrl = canvas.toDataURL('image/jpeg', 0.95);

      // Trigger browser file download
      const filename = `withdrawal_${inputCoin.value.trim().toLowerCase()}_${inputAmount.value.trim().replace('.', '_')}.jpg`;
      const downloadLink = document.createElement('a');
      downloadLink.href = jpegDataUrl;
      downloadLink.download = filename;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);

      showToast(`Downloaded ${filename}`);
    } catch (err) {
      console.error('Download error:', err);
      showToast('Error generating image, trying print fallback');
      window.print();
    } finally {
      downloadJpgBtn.disabled = false;
      downloadJpgBtn.innerHTML = originalText;
    }
  });

  // Bind live change events
  [
    inputPlatform, inputAmount, inputCoin, inputStatus, inputNetwork,
    inputAddress, inputTxidType, inputTxid, inputFee, inputWallet
  ].forEach(input => {
    input.addEventListener('input', updatePreview);
    input.addEventListener('change', updatePreview);
  });

  // Initial load
  updatePreview();
});
