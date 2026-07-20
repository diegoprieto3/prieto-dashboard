const fetch = require('node-fetch');

const VAPI_API_KEY = 'e19f3aaf-e171-4e14-80c4-57c4139328e7';
const ASSISTANT_ID = '9d64157f-5083-4e89-9e00-4559bd485dff';
const SUPABASE_URL = 'https://haxozjahcnktbliephdx.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhheG96amFoY25rdGJsaWVwaGR4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyMjgwMzIsImV4cCI6MjA5NzgwNDAzMn0.f5hw4q11wtPeTU6A21xaX9qJdCkFdMWZ1qCKOrwaeZE';

exports.handler = async function(event, context) {
  try {
    const vapiRes = await fetch(`https://api.vapi.ai/call?assistantId=${ASSISTANT_ID}&limit=100`, {
      headers: { 'Authorization': `Bearer ${VAPI_API_KEY}` }
    });
    if (!vapiRes.ok) throw new Error('Vapi error ' + vapiRes.status);
    const vapiData = await vapiRes.json();
    const calls = Array.isArray(vapiData) ? vapiData : (vapiData.results || []);

    const rows = await Promise.all(calls.map(async (call) => {
      let transcript = call.artifact?.transcript || '';
      let callerName = '';
      let callReason = '';
      let summary = '';

      const messages = call.artifact?.messages || [];
      for (let i = 0; i < messages.length - 1; i++) {
        const m = messages[i];
        if ((m.role === 'bot' || m.role === 'assistant') && (m.message || '').toLowerCase().includes('nombre')) {
          const nextUser = messages.slice(i + 1).find(u => u.role === 'user');
          if (nextUser) {
            const raw = (nextUser.message || '').trim();
            const cleaned = raw.replace(/^(sí|si|claro|okay|ok)[.,]?\s*/i, '').replace(/^(me llamo|soy|mi nombre es)\s*/i, '').trim();
            const words = cleaned.split(/\s+/);
            if (words.length >= 1 && words.length <= 4) callerName = cleaned;
          }
          break;
        }
      }
      for (let i = 0; i < messages.length - 1; i++) {
        const m = messages[i];
        if ((m.role === 'bot' || m.role === 'assistant') && (m.message || '').toLowerCase().includes('ayudarle')) {
          const nextUser = messages.slice(i + 1).find(u => u.role === 'user');
          if (nextUser) callReason = (nextUser.message || '').trim();
          break;
        }
      }

      summary = call.analysis?.summary || call.summary || '';

      const dur = call.durationSeconds || 0;

      return {
        id: call.id,
        assistant_id: ASSISTANT_ID,
        caller_number: call.customer?.number || '',
        caller_name: callerName,
        duration: dur,
        started_at: call.startedAt || call.createdAt,
        ended_at: call.endedAt,
        recording_url: call.artifact?.recordingUrl || '',
        summary: summary,
        end_reason: call.endedReason || '',
        transcript: transcript,
        call_reason: callReason
      };
    }));

    const upsertRes = await fetch(`${SUPABASE_URL}/rest/v1/calls`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify(rows)
    });

    if (!upsertRes.ok) {
      const err = await upsertRes.text();
      throw new Error('Supabase error: ' + err);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, synced: rows.length })
    };
  } catch (e) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: e.message })
    };
  }
};
