// api/proxy.js
// Vercel Functions (Node.js)で動作するNotion専用プロキシコード

module.exports = async (req, res) => {
    // 1. CORSヘッダーの設定 (必須)
    res.setHeader('Access-Control-Allow-Origin', '*'); 
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    // OPTIONSメソッド（プリフライトリクエスト）への対応
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        res.status(405).json({ message: 'Method Not Allowed. Only POST is accepted for proxy execution.' });
        return;
    }

    try {
        // リクエストボディから転送に必要な情報を取得
        const { targetUrl, method, body, tokenKey, tokenValue } = req.body;
        
        if (!targetUrl || !tokenValue || tokenKey !== 'notionToken') {
            res.status(400).json({ message: 'Missing targetUrl, tokenValue, or invalid tokenKey. This proxy only handles Notion.' });
            return;
        }

        // Notion向けのヘッダーを作成
        const headers = { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${tokenValue}`, // Notion Token
            'Notion-Version': '2022-06-28'
        };
        
        // 実際のNotion APIリクエストの実行
        const fetchRes = await fetch(targetUrl, {
            method: method, // GET, POST, PATCH
            headers: headers,
            body: body ? JSON.stringify(body) : null,
        });

        // 応答をそのままクライアントに返す
        const data = await fetchRes.text();
        res.status(fetchRes.status).send(data);

    } catch (error) {
        console.error('Proxy Error:', error);
        res.status(500).json({ message: 'Internal Server Error during proxy execution.' });
    }
};
