async function checkSimStatus() {
    const iccidInput = document.getElementById("iccid").value.trim();
    const resultElement = document.getElementById("result");
    const loadingElement = document.getElementById("loading");
    const buttonElement = document.querySelector("button");

    resultElement.innerHTML = "";
    resultElement.classList.remove("error");

    if (!/^\d{19,20}$/.test(iccidInput)) {
        resultElement.innerHTML = "請輸入有效的19或20位ICCID碼！";
        resultElement.classList.add("error");
        return;
    }

    loadingElement.classList.remove("hidden");
    buttonElement.disabled = true;

    try {
        const response = await fetch("http://localhost:5000/check-sim", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ iccid: iccidInput }),
        });
        const data = await response.json();

        if (data.status) {
            resultElement.innerHTML = `
                <table>
                    <tr><th>項目</th><th>資料</th></tr>
                    <tr><td>IMSI</td><td>${data.imsi || "無資料"}</td></tr>
                    <tr><td>ICCID</td><td>${data.iccid || "無資料"}</td></tr>
                    <tr><td>MSISDN</td><td>${data.msisdn || "無資料"}</td></tr>
                    <tr><td>狀態</td><td>${data.status || "無資料"}</td></tr>
                    <tr><td>啟用日期</td><td>${data.activation_date || "無資料"}</td></tr>
                    <tr><td>結束日期</td><td>${data.termination_date || "無資料"}</td></tr>
                    <tr><td>數據使用</td><td>${data.data_usage || "無資料"}</td></tr>
                </table>
            `;
        } else {
            resultElement.innerHTML = data.message || "查無此ICCID，請確認輸入正確！";
            resultElement.classList.add("error");
        }
    } catch (error) {
        resultElement.innerHTML = "查詢失敗，請稍後再試！";
        resultElement.classList.add("error");
    } finally {
        loadingElement.classList.add("hidden");
        buttonElement.disabled = false;
    }
}