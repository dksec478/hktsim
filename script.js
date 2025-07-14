async function checkSim() {
    const iccidInput = document.getElementById('iccid').value;
    const resultDiv = document.getElementById('result');
    resultDiv.innerHTML = '正在查詢...';

    try {
        const response = await fetch('https://hktsim.onrender.com/check-sim', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ iccid: iccidInput })
        });

        const data = await response.json();
        if (response.ok) {
            resultDiv.innerHTML = `
                <h2>查詢結果</h2>
                <table>
                    <tr><th>IMSI</th><td>${data.imsi}</td></tr>
                    <tr><th>ICCID</th><td>${data.iccid}</td></tr>
                    <tr><th>MSISDN</th><td>${data.msisdn}</td></tr>
                    <tr><th>狀態</th><td>${data.status}</td></tr>
                    <tr><th>啟用日期</th><td>${data.activation_date}</td></tr>
                    <tr><th>終止日期</th><td>${data.termination_date}</td></tr>
                    <tr><th>數據使用量</th><td>${data.data_usage}</td></tr>
                </table>
            `;
        } else {
            resultDiv.innerHTML = `<p style="color: red;">${data.message}</p>`;
        }
    } catch (error) {
        resultDiv.innerHTML = `<p style="color: red;">查詢失敗：${error.message}</p>`;
    }
}