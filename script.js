const menuToggle = document.getElementById("menuToggle");
const navLinks = document.getElementById("navLinks");

if (menuToggle && navLinks) {
  menuToggle.addEventListener("click", function () {
    navLinks.classList.toggle("show");
  });

  document.querySelectorAll(".nav-links a").forEach((link) => {
    link.addEventListener("click", function () {
      navLinks.classList.remove("show");
    });
  });
}

const START_PRICE = 5000;
const PIP_TO_PRICE = 0.1;
const CONTRACT_SIZE = 100;

function round2(num) {
  return Math.round(num * 100) / 100;
}

function formatVN(num) {
  return new Intl.NumberFormat("vi-VN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

function formatOptional(num) {
  if (num === null || num === undefined || Number.isNaN(num)) return "-";
  return formatVN(num);
}

function getCheckedValue(name) {
  const checked = document.querySelector(`input[name="${name}"]:checked`);
  return checked ? checked.value : "";
}

function getGroupConfig(groupNumber) {
  return {
    group: groupNumber,
    orders: parseInt(document.getElementById(`g${groupNumber}Orders`).value, 10),
    stepPip: parseFloat(document.getElementById(`g${groupNumber}Step`).value),
    startFactor: parseFloat(document.getElementById(`g${groupNumber}StartFactor`).value),
    innerFactor: parseFloat(document.getElementById(`g${groupNumber}InnerFactor`).value),
  };
}

function calculateFloatingLoss(orders, currentPrice) {
  return orders.reduce((sum, order) => {
    return sum + (currentPrice - order.entryPrice) * order.lotRaw * CONTRACT_SIZE;
  }, 0);
}

function calculateExit(orders, currentPrice, tpMode, tpValuePip) {
  const totalLotRaw = orders.reduce((sum, order) => sum + order.lotRaw, 0);

  if (tpMode === "last") {
    const exitPrice = currentPrice + tpValuePip * PIP_TO_PRICE;
    const profit = orders.reduce((sum, order) => {
      return sum + (exitPrice - order.entryPrice) * order.lotRaw * CONTRACT_SIZE;
    }, 0);

    return {
      exitPrice,
      recoveryNeed: exitPrice - currentPrice,
      profit,
      totalLotRaw,
    };
  }

  const targetProfit = totalLotRaw * tpValuePip * 10;
  const weightedEntrySum = orders.reduce((sum, order) => {
    return sum + order.entryPrice * order.lotRaw;
  }, 0);
  const exitPrice = (targetProfit / CONTRACT_SIZE + weightedEntrySum) / totalLotRaw;

  return {
    exitPrice,
    recoveryNeed: exitPrice - currentPrice,
    profit: targetProfit,
    totalLotRaw,
  };
}

function setFieldVisibility() {
  const limitMode = getCheckedValue("limitMode");
  const tpMode = getCheckedValue("tpMode");

  document.querySelectorAll("[data-limit-field]").forEach((field) => {
    field.classList.toggle("is-hidden", field.dataset.limitField !== limitMode);
  });

  document.querySelectorAll("[data-tp-field]").forEach((field) => {
    field.classList.toggle("is-hidden", field.dataset.tpField !== tpMode);
  });
}

function setEmptyResult(message) {
  document.getElementById("sumOrders").textContent = "0";
  document.getElementById("sumLots").textContent = "0,00";
  document.getElementById("maxFloatingLoss").textContent = "0,00";
  document.getElementById("finalDrawPrice").textContent = "0,00";
  document.getElementById("recoveryPrice").textContent = "0,00";
  document.getElementById("exitProfitOutput").textContent = "0,00";
  document.getElementById("maxFloatingLoss").classList.remove("negative-cell", "positive-cell");
  document.getElementById("exitProfitOutput").classList.remove("negative-cell", "positive-cell");
  document.getElementById("dcaNote").innerHTML = message;
  document.getElementById("orderRows").innerHTML = `
    <tr>
      <td colspan="10">${message}</td>
    </tr>
  `;
}

function renderRows(rows) {
  const orderRows = document.getElementById("orderRows");

  orderRows.innerHTML = rows.map((row) => {
    const stateClass = row.stateTotal < 0 ? "negative-cell" : "positive-cell";
    const profitClass = row.profit < 0 ? "negative-cell" : "positive-cell";

    return `
      <tr>
        <td>${row.orderNo}</td>
        <td>Nhóm ${row.groupNo}</td>
        <td>${formatVN(row.lot)}</td>
        <td>${formatOptional(row.factorApplied)}</td>
        <td>${formatVN(row.totalLot)}</td>
        <td>${formatVN(row.stepDca)}</td>
        <td>${formatVN(row.drawPrice)}</td>
        <td>${formatVN(row.recoveryNeed)}</td>
        <td class="${profitClass}">${formatVN(row.profit)}</td>
        <td class="${stateClass}">${formatVN(row.stateTotal)}</td>
      </tr>
    `;
  }).join("");
}

function setSignedText(elementId, value) {
  const element = document.getElementById(elementId);
  element.textContent = formatVN(value);
  element.classList.toggle("negative-cell", value < 0);
  element.classList.toggle("positive-cell", value >= 0);
}

function simulateDCA() {
  setFieldVisibility();

  const baseLot = parseFloat(document.getElementById("baseLot").value);
  const limitMode = getCheckedValue("limitMode");
  const tpMode = getCheckedValue("tpMode");
  const maxDrawPrice = parseFloat(document.getElementById("maxDrawPrice").value);
  const maxSL = parseFloat(document.getElementById("maxSL").value);
  const tpTotalPip = parseFloat(document.getElementById("tpTotalPip").value);
  const tpLastPip = parseFloat(document.getElementById("tpLastPip").value);
  const tpValuePip = tpMode === "last" ? tpLastPip : tpTotalPip;

  if (Number.isNaN(baseLot) || baseLot <= 0) {
    setEmptyResult("Vui lòng nhập Lot gốc lớn hơn 0.");
    return;
  }

  if (limitMode === "price" && (Number.isNaN(maxDrawPrice) || maxDrawPrice < 0)) {
    setEmptyResult("Vui lòng nhập Giá gồng tối đa hợp lệ.");
    return;
  }

  if (limitMode === "maxsl" && (Number.isNaN(maxSL) || maxSL <= 0)) {
    setEmptyResult("Vui lòng nhập MaxSL là số dương.");
    return;
  }

  if (Number.isNaN(tpValuePip) || tpValuePip <= 0) {
    setEmptyResult("Vui lòng nhập TP hợp lệ theo lựa chọn hiện tại.");
    return;
  }

  const groups = [];
  for (let i = 1; i <= 7; i++) {
    const group = getGroupConfig(i);

    if (
      Number.isNaN(group.orders) || group.orders <= 0 ||
      Number.isNaN(group.stepPip) || group.stepPip <= 0 ||
      Number.isNaN(group.startFactor) || group.startFactor <= 0 ||
      Number.isNaN(group.innerFactor) || group.innerFactor <= 0
    ) {
      setEmptyResult(`Thông số nhóm ${i} chưa hợp lệ.`);
      return;
    }

    groups.push(group);
  }

  const orders = [];
  const rows = [];
  let previousLotRaw = baseLot;
  let previousEntryPrice = START_PRICE;
  let orderNo = 0;
  let stopReason = "";

  for (let g = 0; g < groups.length; g++) {
    const group = groups[g];

    for (let i = 1; i <= group.orders; i++) {
      let lotRaw;
      let entryPrice;
      let factorApplied = null;
      let stepDca = 0;

      if (g === 0 && i === 1) {
        lotRaw = baseLot;
        entryPrice = START_PRICE;
      } else {
        factorApplied = i === 1 ? group.startFactor : group.innerFactor;
        lotRaw = previousLotRaw * factorApplied;
        stepDca = group.stepPip * PIP_TO_PRICE;
        entryPrice = round2(previousEntryPrice - stepDca);
      }

      const drawPrice = START_PRICE - entryPrice;
      const candidateOrders = orders.concat({
        orderNo: orderNo + 1,
        groupNo: group.group,
        lotRaw,
        entryPrice,
      });
      const stateTotal = calculateFloatingLoss(candidateOrders, entryPrice);

      if (limitMode === "price" && drawPrice > maxDrawPrice + 0.001) {
        stopReason = `Dừng trước lệnh ${orderNo + 1} vì Giá gồng sẽ vượt ${formatVN(maxDrawPrice)}.`;
        break;
      }

      if (limitMode === "maxsl" && stateTotal < -maxSL - 0.001) {
        stopReason = `Dừng trước lệnh ${orderNo + 1} vì trạng thái tổng sẽ vượt -${formatVN(maxSL)} USD.`;
        break;
      }

      orderNo += 1;
      const order = {
        orderNo,
        groupNo: group.group,
        lotRaw,
        lot: round2(lotRaw),
        entryPrice,
      };

      orders.push(order);

      const exit = calculateExit(orders, entryPrice, tpMode, tpValuePip);

      rows.push({
        orderNo,
        groupNo: group.group,
        lot: round2(lotRaw),
        factorApplied,
        totalLot: round2(exit.totalLotRaw),
        stepDca,
        drawPrice,
        recoveryNeed: exit.recoveryNeed,
        profit: exit.profit,
        stateTotal,
      });

      previousLotRaw = lotRaw;
      previousEntryPrice = entryPrice;
    }

    if (stopReason) break;
  }

  if (orders.length === 0) {
    setEmptyResult("Không tạo được lệnh nào. Kiểm tra lại thông số đầu vào.");
    return;
  }

  const finalRow = rows[rows.length - 1];
  const limitLabel = limitMode === "price" ? "Theo giá gồng" : "Theo MaxSL";
  const tpLabel = tpMode === "last" ? "TP theo lệnh cuối" : "TP tổng";

  document.getElementById("sumOrders").textContent = orders.length;
  document.getElementById("sumLots").textContent = formatVN(finalRow.totalLot);
  setSignedText("maxFloatingLoss", finalRow.stateTotal);
  document.getElementById("finalDrawPrice").textContent = formatVN(finalRow.drawPrice);
  document.getElementById("recoveryPrice").textContent = formatVN(finalRow.recoveryNeed);
  setSignedText("exitProfitOutput", finalRow.profit);
  document.getElementById("resultModeLabel").textContent = `${limitLabel} · ${tpLabel}`;

  renderRows(rows);

  document.getElementById("dcaNote").innerHTML = `
    Đã mô phỏng <strong>${orders.length}</strong> lệnh theo chế độ
    <strong>${limitLabel}</strong> và <strong>${tpLabel}</strong>.
    Dòng cuối có Giá gồng <strong>${formatVN(finalRow.drawPrice)}</strong>,
    Trạng thái tổng <strong>${formatVN(finalRow.stateTotal)}</strong> USD,
    cần hồi <strong>${formatVN(finalRow.recoveryNeed)}</strong> giá để thoát
    với lợi nhuận dự kiến <strong>${formatVN(finalRow.profit)}</strong> USD.
    ${stopReason ? `<br />${stopReason}` : ""}
  `;
}

window.addEventListener("DOMContentLoaded", function () {
  setFieldVisibility();
  document.querySelectorAll('input[type="number"]').forEach((input) => {
    input.addEventListener("wheel", function () {
      input.blur();
    });
  });
  document.querySelectorAll('input[name="limitMode"], input[name="tpMode"]').forEach((input) => {
    input.addEventListener("change", simulateDCA);
  });
  simulateDCA();
});
