const header = document.getElementById("siteHeader");
const menuToggle = document.getElementById("menuToggle");
const navLinks = document.getElementById("navLinks");

function syncHeader() {
  if (!header) return;
  header.classList.toggle("is-scrolled", window.scrollY > 18);
}

if (menuToggle && navLinks && header) {
  menuToggle.addEventListener("click", () => {
    const isOpen = header.classList.toggle("is-open");
    menuToggle.setAttribute("aria-expanded", String(isOpen));
  });

  navLinks.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      header.classList.remove("is-open");
      menuToggle.setAttribute("aria-expanded", "false");
    });
  });
}

window.addEventListener("scroll", syncHeader, { passive: true });
syncHeader();

const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        revealObserver.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.16 }
);

document.querySelectorAll(".reveal").forEach((element) => {
  revealObserver.observe(element);
});

const START_PRICE = 5000;
const PIP_TO_PRICE = 0.1;
const CONTRACT_SIZE = 100;

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

function getNumber(id) {
  const element = document.getElementById(id);
  return element ? parseFloat(element.value) : NaN;
}

function getGroupConfig(groupNumber) {
  return {
    group: groupNumber,
    orders: parseInt(document.getElementById(`g${groupNumber}Orders`).value, 10),
    stepPip: getNumber(`g${groupNumber}Step`),
    startFactor: getNumber(`g${groupNumber}StartFactor`),
    innerFactor: getNumber(`g${groupNumber}InnerFactor`),
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

function setSignedText(elementId, value) {
  const element = document.getElementById(elementId);
  if (!element) return;
  element.textContent = formatVN(value);
  element.classList.toggle("negative-cell", value < 0);
  element.classList.toggle("positive-cell", value >= 0);
}

function setEmptyResult(message) {
  const resultModeLabel = document.getElementById("resultModeLabel");
  if (resultModeLabel) resultModeLabel.textContent = "Theo giá gồng · TP tổng";

  document.getElementById("sumOrders").textContent = "0";
  document.getElementById("sumLots").textContent = "0,00";
  document.getElementById("maxFloatingLoss").textContent = "0,00";
  document.getElementById("finalDrawPrice").textContent = "0,00";
  document.getElementById("recoveryPrice").textContent = "0,00";
  document.getElementById("exitProfitOutput").textContent = "0,00";
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

function simulateDCA() {
  setFieldVisibility();

  const baseLot = getNumber("baseLot");
  const limitMode = getCheckedValue("limitMode");
  const tpMode = getCheckedValue("tpMode");
  const limitLabel = limitMode === "price" ? "Theo giá gồng" : "Theo MaxSL";
  const tpLabel = tpMode === "last" ? "TP theo lệnh cuối" : "TP tổng";
  const maxDrawPrice = getNumber("maxDrawPrice");
  const maxSL = getNumber("maxSL");
  const tpTotalPip = getNumber("tpTotalPip");
  const tpLastPip = getNumber("tpLastPip");
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
  for (let i = 1; i <= 7; i += 1) {
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

  for (let g = 0; g < groups.length; g += 1) {
    const group = groups[g];

    for (let i = 1; i <= group.orders; i += 1) {
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
        entryPrice = previousEntryPrice - stepDca;
      }

      const newOrder = {
        orderNo: orderNo + 1,
        groupNo: group.group,
        lotRaw,
        entryPrice,
      };

      const projectedOrders = orders.concat(newOrder);
      const floatingLoss = calculateFloatingLoss(projectedOrders, entryPrice);
      const drawPrice = START_PRICE - entryPrice;

      if (limitMode === "price" && drawPrice > maxDrawPrice) {
        stopReason = `Dừng trước lệnh ${orderNo + 1}: giá gồng ${formatVN(drawPrice)} vượt giới hạn ${formatVN(maxDrawPrice)}.`;
        break;
      }

      if (limitMode === "maxsl" && Math.abs(floatingLoss) > maxSL) {
        stopReason = `Dừng trước lệnh ${orderNo + 1}: floating loss ${formatVN(floatingLoss)} vượt MaxSL ${formatVN(maxSL)}.`;
        break;
      }

      orders.push(newOrder);
      orderNo += 1;

      const exit = calculateExit(orders, entryPrice, tpMode, tpValuePip);
      const totalLotRaw = orders.reduce((sum, order) => sum + order.lotRaw, 0);

      rows.push({
        orderNo,
        groupNo: group.group,
        lot: lotRaw,
        factorApplied,
        totalLot: totalLotRaw,
        stepDca,
        drawPrice,
        recoveryNeed: exit.recoveryNeed,
        profit: exit.profit,
        stateTotal: floatingLoss,
      });

      previousLotRaw = lotRaw;
      previousEntryPrice = entryPrice;
    }

    if (stopReason) break;
  }

  if (!orders.length) {
    setEmptyResult(stopReason || "Không có lệnh nào được mô phỏng.");
    return;
  }

  const finalCurrentPrice = orders[orders.length - 1].entryPrice;
  const finalExit = calculateExit(orders, finalCurrentPrice, tpMode, tpValuePip);
  const totalLotRaw = orders.reduce((sum, order) => sum + order.lotRaw, 0);
  const maxFloatingLoss = calculateFloatingLoss(orders, finalCurrentPrice);
  const finalDrawPrice = START_PRICE - finalCurrentPrice;
  const finalRow = rows[rows.length - 1];
  const resultModeLabel = document.getElementById("resultModeLabel");
  if (resultModeLabel) resultModeLabel.textContent = `${limitLabel} · ${tpLabel}`;

  document.getElementById("sumOrders").textContent = String(orders.length);
  document.getElementById("sumLots").textContent = formatVN(totalLotRaw);
  setSignedText("maxFloatingLoss", maxFloatingLoss);
  document.getElementById("finalDrawPrice").textContent = formatVN(finalDrawPrice);
  document.getElementById("recoveryPrice").textContent = formatVN(finalExit.recoveryNeed);
  setSignedText("exitProfitOutput", finalExit.profit);

  document.getElementById("dcaNote").innerHTML = `
    Đã mô phỏng <strong>${orders.length}</strong> lệnh theo chế độ
    <strong>${limitLabel}</strong> và <strong>${tpLabel}</strong>.
    Dòng cuối có Giá gồng <strong>${formatVN(finalRow.drawPrice)}</strong>,
    Trạng thái tổng <strong>${formatVN(finalRow.stateTotal)}</strong> USD,
    cần hồi <strong>${formatVN(finalRow.recoveryNeed)}</strong> giá để thoát
    với lợi nhuận dự kiến <strong>${formatVN(finalRow.profit)}</strong> USD.
    ${stopReason ? `<br>${stopReason}` : ""}
  `;

  renderRows(rows);
}

document.querySelectorAll("input").forEach((input) => {
  input.addEventListener("input", simulateDCA);
  input.addEventListener("change", simulateDCA);
});

simulateDCA();
