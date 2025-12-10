module.exports = async function(req, res) {
  console.log('🔥 PROXY CALLED:', req.method, JSON.stringify(req.body || {}));
  
  res.setHeader('Access-Control-Allow-Origin', '*');
  // ... 既存ヘッダー ...

  if (req.method === 'GET') {
    res.json({ status: 'Proxy OK!', method: req.method });
    return;
  }

  try {
    const body = req.body || {};
    console.log('📦 PROXY BODY:', JSON.stringify(body));
    
    // テスト用：targetUrlがあれば即Notion転送
    if (body.targetUrl) {
      console.log('🚀 FORWARDING TO:', body.targetUrl);
      
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${body.tokenValue}`,
        'Notion-Version': '2022-06-28'
      };
      
      const upstreamRes = await fetch(body.targetUrl, {
        method: body.method || 'POST',
        headers,
        body: body.body ? JSON.stringify(body.body) : undefined
      });
      
      console.log('📡 NOTION RESP:', upstreamRes.status);
      const data = await upstreamRes.json();
      res.status(upstreamRes.status).json(data);
      return;
    }
    
    res.json({ status: 'Proxy OK!', received: body });
  } catch (err) {
    console.error('💥 PROXY ERROR:', err);
    res.status(500).json({ error: err.message });
  }
};
