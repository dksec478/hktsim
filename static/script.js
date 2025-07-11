async function checkSim() {
    const iccid = document.getElementById("iccid").value.trim();
    const resultTable = document.getElementById("result-table");
    const resultBody = document.getElementById("result-body");
    const errorMessage = document.getElementById("error-message");

    // 清空先前結果
    resultBody.innerHTML = "";
    resultTable.style.display = "none";
    errorMessage.style.display = "none";

    // 驗證 ICCID
    if (!iccid || !/^\d{19,20}$/.test(iccid)) {
        errorMessage.textContent = "請輸入有效的 19 或 20 位 ICCID";
        errorMessage.style.display = "block";
        return;
    }

    try {
        // 發送 POST 請求
        const response = await fetch("/check-sim", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ iccid })
        });

        const data = await response.json();

        if (response.ok) {
            // 顯示查詢結果
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
        } else {
            // 顯示錯誤訊息
            errorMessage.textContent = data.message || "查詢失敗，請稍後重試";
            errorMessage.style.display = "block";
        }
    } catch (error) {
        errorMessage.textContent = "無法連繫伺服器，請檢查網路";
        errorMessage.style.display = "block";
        console.error("Error:", error);
    }
}