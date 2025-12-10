// Vercel Serverless Function 形式（req.body問題解決）
export default async function (req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');

  // OPTIONSプリフライト即応答
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    // Vercel形式でbody取得
    let body;
    if (req.body) {
      body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    } else {
      body = {};
    }

    // apiFetchパターン
    if (body.targetUrl) {
      const { targetUrl, method = 'GET', body: requestBody, tokenKey, tokenValue } = body;
      
      const headers = {
        'Content-Type': 'application/json',
        'Notion-Version': '2025-09-03'
      };

      if (tokenKey === 'notionToken' && tokenValue) {
        headers.Authorization = `Bearer ${tokenValue}`;
      }
      if (tokenKey === 'togglApiToken' && tokenValue) {
        headers.Authorization = `Basic ${btoa(tokenValue + ':api_token')}`;
      }

      const fetchOptions = { 
        method: method.toUpperCase(), 
        headers 
      };
      if (requestBody) fetchOptions.body = JSON.stringify(requestBody);

      const response = await fetch(targetUrl, fetchOptions);
      const data = await response.text();
      
      let jsonData;
      try { jsonData = JSON.parse(data); } catch(e) { jsonData = data; }

      res.status(response.status).json(jsonData);
      return;
    }

    // apiCustomFetchパターン
    if (body.customEndpoint) {
      const result = await handleCustomEndpoint(body.customEndpoint, body);
      res.json(result);
      return;
    }

    res.status(400).json({ error: 'targetUrl or customEndpoint required' });

  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).json({ error: error.message });
  }
}

async function handleCustomEndpoint(endpoint, params) {
  // 前回のv2025-09-03対応コードそのまま使用
  const { dbId, dataSourceId, tokenValue, workspaceId, description } = params;
  
  // getConfig, getKpi, startTogglTrackingの実装（前回と同じ）
  // ...（省略：前回のコードそのままコピペ）
}


// v2025-09-03対応 カスタムエンドポイント
async function handleCustomEndpoint(endpoint, params) {
  const { dbId, dataSourceId, tokenValue, workspaceId, description } = params;

  switch (endpoint) {
    case 'getConfig':
      // 1. データベース情報取得 → data_source_id取得
      const dbUrl = `https://api.notion.com/v1/databases/${dbId}`;
      const dbResponse = await fetch(dbUrl, {
        headers: { 
          'Authorization': `Bearer ${tokenValue}`,
          'Notion-Version': '2025-09-03'
        }
      });

      if (!dbResponse.ok) throw new Error(`DB fetch failed: ${dbResponse.status}`);

      const db = await dbResponse.json();
      
      // 2. 最初のdata_source_idを取得（複数ある場合は先頭）
      let actualDataSourceId = dataSourceId || db.data_sources?.[0]?.id || dbId;
      
      // 3. data_sourceのプロパティ取得
      const dsUrl = `https://api.notion.com/v1/data_sources/${actualDataSourceId}`;
      const dsResponse = await fetch(dsUrl, {
        headers: { 
          'Authorization': `Bearer ${tokenValue}`,
          'Notion-Version': '2025-09-03'
        }
      });

      if (!dsResponse.ok) throw new Error(`DataSource fetch failed: ${dsResponse.status}`);
      
      const dataSource = await dsResponse.json();
      
      // 4. カテゴリ/部門抽出
      const categories = dataSource.properties['カテゴリ']?.select?.options?.map(o => o.name) || [];
      const departments = dataSource.properties['部門']?.multi_select?.options?.map(o => o.name) || [];

      return {
        dataSourceId: actualDataSourceId,
        categories,
        departments,
        databaseId: dbId
      };

    case 'getKpi':
      // v2025-09-03: data_sources/query エンドポイント使用
      const actualDataSourceId = dataSourceId || dbId;
      const kpiUrl = `https://api.notion.com/v1/data_sources/${actualDataSourceId}/query`;
      
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      
      const filter = {
        and: [
          { property: 'ステータス', status: { does_not_equal: '完了' } },
          { property: '作成日', date: { on_or_after: weekAgo.toISOString().split('T')[0] } }
        ]
      };

      const kpiResponse = await fetch(kpiUrl, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${tokenValue}`,
          'Notion-Version': '2025-09-03',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ filter })
      });

      const kpiData = await kpiResponse.json();
      const tasks = kpiData.results || [];

      const totalWeekMins = tasks.length * 60;
      const totalMonthMins = tasks.length * 240;

      const categoryWeekMins = {};
      tasks.forEach(task => {
        const cat = task.properties['カテゴリ']?.select?.name || '未分類';
        categoryWeekMins[cat] = (categoryWeekMins[cat] || 0) + 60;
      });

      return { totalWeekMins, totalMonthMins, categoryWeekMins };

    case 'startTogglTracking':
      const togglUrl = 'https://api.track.toggl.com/api/v9/time_entries';
      const togglResponse = await fetch(togglUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${btoa(`${params.tokenValue}:api_token`)}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          time_entry: {
            description,
            wid: workspaceId,
            start: new Date().toISOString(),
            created_with: 'notion-toggl-timer-v2025'
          }
        })
      });

      if (!togglResponse.ok) {
        const errorData = await togglResponse.text();
        throw new Error(`Toggl: ${togglResponse.status} ${errorData}`);
      }

      return await togglResponse.json();

    default:
      throw new Error(`Unknown endpoint: ${endpoint}`);
  }
}
