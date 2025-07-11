async function checkSim() {
    console.log("checkSim 函數已觸發");
    const iccid = document.getElementById("iccid").value.trim();
    console.log("ICCID:", iccid);
    const resultTable = document.getElementById("result-table");
    const resultBody = document.getElementById("result-body");
    const errorMessage = document.getElementById("error-message");

    resultBody.innerHTML = "";
    resultTable.style.display = "none";
    errorMessage.style.display = "none";

    if (!iccid || !/^\d{19,20}$/.test(iccid)) {
        errorMessage.textContent = "請輸入有效的 19 或 20 位 ICCID";
        errorMessage.style.display = "block";
        console.log("無效 ICCID");
        return;
    }

    try {
        console.log("發送 API 請求至 /check-sim");
        const response = await fetch("/check-sim", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ iccid })
        });
        console.log("API 回應狀態:", response.status);

        const data = await response.json();

        if (response.ok) {
            resultTable.style.display = "table";
            const row = document.createElement("tr");
            row.innerHTML = `
                <td>${data.imsi || "N/A"}</td>
                <td>${data.iccid || "N/A"}</td>
                <td>${data.msisdn || "N/A"}</td>
                <td>${data.status || "N/A"}</td>
                <td>${data.activation_date || "N/A"}</td>
                <td>${data.termination_date || "N/A"}</td>
                <td>${data.data_usage || "N/A"}</td>
            `;
            resultBody.appendChild(row);
            console.log("查詢成功:", data);
        } else {
            errorMessage.textContent = data.message || "查詢失敗，請稍後重試";
            errorMessage.style.display = "block";
            console.log("API 錯誤:", data.message);
        }
    } catch (error) {
        errorMessage.textContent = "無法連繫伺服器，請檢查網路";
        errorMessage.style.display = "block";
        console.error("API 請求失敗:", error);
    }
}