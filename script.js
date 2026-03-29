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

function round2(num) {
  return Math.round(num * 100) / 100;
}

function formatVN(num) {
  return new Intl.NumberFormat("vi-VN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
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

function simulateDCA() {
  const baseLot = parseFloat(document.getElementById("baseLot").value);
  const tpTotalPip = parseFloat(document.getElementById("tpTotalPip").value);
  const maxDrawPrice = parseFloat(document.getElementById("maxDrawPrice").value);

  const note = document.getElementById("dcaNote");

  if (
    isNaN(baseLot) || baseLot <= 0 ||
    isNaN(tpTotalPip) || tpTotalPip <= 0 ||
    isNaN(maxDrawPrice) || maxDrawPrice < 0
  ) {
    note.innerHTML = "Vui lòng nhập đúng Lot gốc, TP tổng và Giá gồng tối đa.";
    return;
  }

  const groups = [];
  for (let i = 1; i <= 7; i++) {
    const group = getGroupConfig(i);

    if (
      isNaN(group.orders) || group.orders <= 0 ||
      isNaN(group.stepPip) || group.stepPip <= 0 ||
      isNaN(group.startFactor) || group.startFactor <= 0 ||
      isNaN(group.innerFactor) || group.innerFactor <= 0
    ) {
      note.innerHTML = `Thông số nhóm ${i} chưa hợp lệ.`;
      return;
    }

    groups.push(group);
  }

  const START_PRICE = 5000;

  let orders = [];
  // LƯU lot CHƯA ROUND để tránh tích lũy sai số khi nhân hệ số liên tiếp
  let previousLotRaw = baseLot;
  let previousEntryPrice = START_PRICE;
  let orderNo = 0;
  let stopSimulation = false;

  for (let g = 0; g < groups.length; g++) {
    const group = groups[g];

    for (let i = 1; i <= group.orders; i++) {
      let lotRaw;
      let entryPrice;

      if (g === 0 && i === 1) {
        // Lệnh đầu tiên toàn chuỗi
        lotRaw = baseLot;
        entryPrice = START_PRICE;
      } else {
        // Tính lot: dùng lotRaw (chưa round) để giữ chính xác
        if (i === 1) {
          // Lệnh đầu nhóm mới: nhân hệ số startFactor của nhóm mới vào lot RAW của lệnh trước
          lotRaw = previousLotRaw * group.startFactor;
        } else {
          // Lệnh tiếp theo trong nhóm: nhân innerFactor
          lotRaw = previousLotRaw * group.innerFactor;
        }

        // Bước giá: với XAUUSD, 1 pip = 0.1 giá → step pip * 0.1
        entryPrice = round2(previousEntryPrice - group.stepPip * 0.1);
      }

      const drawFromStart = START_PRICE - entryPrice;

      // Nếu lệnh này vượt quá giá gồng thì dừng
      if (drawFromStart > maxDrawPrice + 0.001) {
        stopSimulation = true;
        break;
      }

      const lotDisplay = round2(lotRaw); // Round chỉ để hiển thị & tính toán cuối

      orderNo += 1;
      orders.push({
        orderNo: orderNo,
        groupNo: group.group,
        lotRaw: lotRaw,       // dùng để tính toán chính xác
        lot: lotDisplay,      // dùng để hiển thị
        entryPrice: entryPrice
      });

      previousLotRaw = lotRaw;
      previousEntryPrice = entryPrice;
    }

    if (stopSimulation) break;
  }

  if (orders.length === 0) {
    note.innerHTML = "Không tạo được lệnh nào. Kiểm tra lại thông số đầu vào.";
    return;
  }

  // === TỔNG LOT (dùng lotRaw để chính xác) ===
  const totalLotRaw = orders.reduce((sum, o) => sum + o.lotRaw, 0);
  const totalLot = round2(totalLotRaw);

  // === GIÁ HIỆN TẠI GIẢ ĐỊNH = lệnh xa nhất (để tính âm trạng thái tại đáy gồng) ===
  const farthestEntry = orders[orders.length - 1].entryPrice;

  // === ÂM TRẠNG THÁI LỚN NHẤT ===
  // Tại thời điểm giá = farthestEntry, tất cả lệnh trước đó đều đang lỗ
  // Floating = (currentPrice - entryPrice) * lot * 100  [âm vì currentPrice < entryPrice với BUY]
  // Với XAUUSD: 1 lot = 100 oz, pip value = $1/pip/0.01lot => hệ số = lot * 100
  const maxFloatingLoss = orders.reduce((sum, o) => {
    return sum + (farthestEntry - o.entryPrice) * o.lotRaw * 100;
  }, 0);
  // Kết quả sẽ âm (lỗ), round2 để hiển thị

  // === TÍNH GIÁ THOÁT VÀ LÃI KHI THOÁT ===
  // exitProfit = totalLot * tpTotalPip (pip) * pip_value_per_lot
  // Với XAUUSD: pip_value = 10 USD/pip/lot => pip_value_per_0.01lot = 0.1 USD/pip
  // exitProfit = totalLotRaw * tpTotalPip * 10
  const exitProfit = totalLotRaw * tpTotalPip * 10;

  // === GIÁ THOÁT (break-even exit price) ===
  // sum((exitPrice - entryPrice) * lotRaw * 100) = exitProfit
  // exitPrice * totalLotRaw * 100 - sum(entryPrice * lotRaw * 100) = exitProfit
  // exitPrice = (exitProfit + sum(entryPrice * lotRaw) * 100) / (totalLotRaw * 100)
  const weightedEntrySum = orders.reduce((sum, o) => sum + o.entryPrice * o.lotRaw, 0);
  const exitPrice = (exitProfit / 100 + weightedEntrySum) / totalLotRaw;

  // === GIÁ HỒI CẦN THIẾT (tính từ lệnh xa nhất) ===
  const recoveryNeed = exitPrice - farthestEntry;

  // === HIỂN THỊ ===
  document.getElementById("sumOrders").textContent = orders.length;
  document.getElementById("sumLots").textContent = formatVN(totalLot);
  document.getElementById("maxFloatingLoss").textContent = formatVN(round2(maxFloatingLoss));
  document.getElementById("recoveryPrice").textContent = formatVN(round2(recoveryNeed));
  document.getElementById("exitProfitOutput").textContent = formatVN(round2(exitProfit));

  note.innerHTML = `
    Đã mô phỏng <strong>${orders.length}</strong> lệnh với mức gồng tối đa
    <strong>${formatVN(maxDrawPrice)}</strong> giá.
    Âm trạng thái lớn nhất tại vùng giá gồng là
    <strong>${formatVN(round2(maxFloatingLoss))}</strong> USD.
    Nếu giá hồi thêm <strong>${formatVN(round2(recoveryNeed))}</strong> giá
    tính từ lệnh xa nhất, bot sẽ thoát toàn bộ chuỗi với lợi nhuận dự kiến
    <strong>${formatVN(round2(exitProfit))}</strong> USD.
  `;
}

window.addEventListener("DOMContentLoaded", function () {
  simulateDCA();
});
