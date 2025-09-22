/* ========= voice.js (drop-in) ========= */
(function () {
  // ---- config ----
  const TOKEN_URL = 'https://ai-agent.msdreamsolutions.com/webhook/eleven-token-lexi';

  // ---- helpers ----
  const log = (...a) => console.log('[voice]', ...a);
  const $ = (id) => document.getElementById(id);
  const status = (m) => {
    const el = $('voiceStatus');
    if (el) el.textContent = m;
    log(m);
  };

  // make sure the button is clickable/visible even if the page has overlays
  function makeButtonUsable(btn) {
    btn.style.pointerEvents = 'auto';
    btn.style.zIndex = '2147483647';
  }

  // attach click once the button exists (GHL sometimes injects it late)
  function wireButton() {
    const btn = $('startVoice');
    if (!btn) return false;

    makeButtonUsable(btn);
    btn.addEventListener('click', start, { once: true });
    log('click listener attached to #startVoice');
    return true;
  }

  // retry a few times until button is present
  if (!wireButton()) {
    let tries = 0;
    const id = setInterval(() => {
      if (wireButton() || ++tries > 30) clearInterval(id);
    }, 200);
  }

  async function start() {
    const btn = $('startVoice');
    try {
      if (btn) btn.disabled = true;
      status('Fetching signed URL…');

      // 1) Get signed_url from your n8n webhook
      const r = await fetch(TOKEN_URL, { method: 'GET' });
      if (!r.ok) throw new Error('Token fetch HTTP ' + r.status);
      const j = await r.json();

      // Accept clean or previously “wrapped” formats
      const signedUrl =
        j?.signed_url ||
        j?.object?.signed_url ||
        j?.object?.Object?.['\n']?.signed_url ||
        j?.['\n']?.signed_url;

      if (!signedUrl) throw new Error('No signed_url in JSON');
      status('Got signed URL ✅');

      // 2) Start WebRTC with ElevenLabs using the signed URL
      await startWithSignedUrl(signedUrl);

      status('Assistant is live 🎙️');
      if (btn) btn.textContent = 'Assistant is live 🎙️';
    } catch (e) {
      console.error(e);
      status(e.message || 'Failed to start');
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Tap to retry';
        btn.addEventListener('click', start, { once: true });
      }
    }
  }

  async function startWithSignedUrl(signedUrl) {
    // Create the peer connection
    const pc = new RTCPeerConnection();

    // Play agent audio
    pc.ontrack = (e) => {
      let audio = $('eleven-audio');
      if (!audio) {
        audio = document.createElement('audio');
        audio.id = 'eleven-audio';
        audio.autoplay = true;
        audio.setAttribute('playsinline', '');
        document.body.appendChild(audio);
      }
      audio.srcObject = e.streams[0];
      status('Receiving agent audio 🎧');
    };

    // Get mic and send it
    status('Requesting microphone…');
    const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
    mic.getTracks().forEach((t) => pc.addTrack(t, mic));

    // Also ensure we receive audio back
    pc.addTransceiver('audio', { direction: 'recvonly' });

    // 3) SDP offer → POST → SDP answer
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    const sdpEndpoint = signedUrl.replace(/^wss:/, 'https:');
    const resp = await fetch(sdpEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/sdp' },
      body: offer.sdp,
    });
    if (!resp.ok) throw new Error('SDP exchange failed: HTTP ' + resp.status);

    const answerSdp = await resp.text();
    await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });

    pc.onconnectionstatechange = () => log('pc state:', pc.connectionState);
  }
})();
