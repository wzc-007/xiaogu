(() => {
  const $ = (id) => document.getElementById(id);
  const STORAGE_KEY = "queue-demo-settings-v1";
  const defaults = { ticket: "A85", called: "A08", minutes: 2.5, pickup: defaultPickupTime(), initialWait: 77 };
  let state = loadState();
  let toastTimer;

  function loadState() {
    try { return { ...defaults, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") }; }
    catch { return { ...defaults }; }
  }

  function normalizeNumber(value) {
    const clean = String(value || "").toUpperCase().replace(/\s+/g, "");
    const match = clean.match(/^([A-Z\u4e00-\u9fa5]*)(\d+)$/);
    return match ? { label: `${match[1] || "A"}${Number(match[2])}`, prefix: match[1] || "A", number: Number(match[2]) } : null;
  }

  function queueMath(ticketValue, calledValue, minutesValue) {
    const ticket = normalizeNumber(ticketValue);
    const called = normalizeNumber(calledValue);
    const minutes = Math.max(.5, Math.min(20, Number(minutesValue) || 2.5));
    let waiting = 0;
    if (ticket && called && ticket.prefix === called.prefix) waiting = Math.max(0, ticket.number - called.number);
    const totalMinutes = Math.round(waiting * minutes);
    return { ticket, called, minutes, waiting, totalMinutes };
  }

  function beijingParts(date = new Date()) {
    const parts = new Intl.DateTimeFormat("zh-CN", {
      timeZone: "Asia/Shanghai", hour12: false, hourCycle: "h23",
      hour: "2-digit", minute: "2-digit", second: "2-digit"
    }).formatToParts(date).reduce((acc, part) => (acc[part.type] = part.value, acc), {});
    return { hour: Number(parts.hour), minute: Number(parts.minute), second: Number(parts.second), text: `${parts.hour}:${parts.minute}:${parts.second}` };
  }

  function defaultPickupTime() {
    const now = beijingParts();
    const total = (now.hour * 60 + now.minute - 3 + 24 * 60) % (24 * 60);
    return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  }

  function minutesSincePickup(pickup) {
    const [h, m] = String(pickup || "00:00").split(":").map(Number);
    const now = beijingParts();
    let diff = now.hour * 60 + now.minute - (h * 60 + m);
    if (diff < 0) diff += 24 * 60;
    return diff;
  }

  function durationText(minutes) {
    if (minutes < 1) return "不到1分钟";
    if (minutes < 60) return `${minutes}分钟`;
    const h = Math.floor(minutes / 60), m = minutes % 60;
    return `${h}小时${m ? `${m}分钟` : ""}`;
  }

  function timeAfter(minutes) {
    const now = beijingParts();
    const total = (now.hour * 60 + now.minute + minutes) % (24 * 60);
    return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  }

  function estimateLabel(totalMinutes) {
    if (totalMinutes <= 0) return "已叫号";
    if (totalMinutes > 30) return "大于30分钟";
    if (totalMinutes <= 5) return "约5分钟";
    return `约${Math.ceil(totalMinutes / 5) * 5}分钟`;
  }

  function render() {
    const calc = queueMath(state.ticket, state.called, state.minutes);
    const ticketLabel = calc.ticket?.label || state.ticket.toUpperCase();
    $("ticketLabel").textContent = ticketLabel;
    $("waitingCount").textContent = calc.waiting;
    $("estimateText").textContent = estimateLabel(calc.totalMinutes);
    $("callingLabel").textContent = calc.waiting === 0 ? "已叫号" : `待叫号 · ${calc.called?.label || state.called.toUpperCase()}`;
    $("pickupTime").textContent = state.pickup;
    $("elapsedText").textContent = durationText(minutesSincePickup(state.pickup));
    // 这里表达的是“取号 → 待叫号 → 已就餐”的阶段进度，
    // 因此等待期间始终延伸到中间的“待叫号”节点，而不是按桌数缩短。
    $("progressFill").style.width = calc.waiting === 0 ? "100%" : "50%";
    updateEditorSummary();
  }

  function updateClock() {
    const now = beijingParts();
    $("beijingClock").textContent = now.text;
    $("statusTime").textContent = now.text.slice(0, 5);
    $("elapsedText").textContent = durationText(minutesSincePickup(state.pickup));
  }

  function openEditor() {
    $("ticketInput").value = state.ticket;
    $("calledInput").value = state.called;
    $("minutesInput").value = state.minutes;
    $("pickupInput").value = state.pickup;
    updateEditorSummary();
    $("sheetBackdrop").hidden = false;
    $("editorSheet").hidden = false;
    document.body.style.overflow = "hidden";
    setTimeout(() => $("calledInput").focus(), 80);
  }

  function closeEditor() {
    $("sheetBackdrop").hidden = true;
    $("editorSheet").hidden = true;
    document.body.style.overflow = "";
  }

  function updateEditorSummary() {
    const calc = queueMath($("ticketInput")?.value ?? state.ticket, $("calledInput")?.value ?? state.called, $("minutesInput")?.value ?? state.minutes);
    $("sheetWaiting").textContent = `前方 ${calc.waiting} 桌 · 约 ${calc.totalMinutes} 分钟`;
    $("arrivalText").textContent = calc.waiting === 0 ? "当前号码已被叫到" : `预计叫号时间 ${timeAfter(calc.totalMinutes)}`;
  }

  function saveSettings() {
    const ticket = normalizeNumber($("ticketInput").value);
    const called = normalizeNumber($("calledInput").value);
    if (!ticket || !called || ticket.prefix !== called.prefix) {
      showToast("请输入相同字母开头的号码，例如 A85 和 A08");
      return;
    }
    const newCalc = queueMath(ticket.label, called.label, $("minutesInput").value);
    state = {
      ticket: ticket.label,
      called: called.label,
      minutes: newCalc.minutes,
      pickup: $("pickupInput").value || state.pickup,
      initialWait: Math.max(Number(state.initialWait) || 0, newCalc.waiting)
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    render(); updateClock(); closeEditor();
    showToast(`已更新：当前叫号 ${state.called}，前方 ${newCalc.waiting} 桌`);
  }

  function showToast(message) {
    clearTimeout(toastTimer);
    $("toast").textContent = message;
    $("toast").classList.add("show");
    toastTimer = setTimeout(() => $("toast").classList.remove("show"), 2200);
  }

  $("openEditor").addEventListener("click", openEditor);
  $("closeEditor").addEventListener("click", closeEditor);
  $("sheetBackdrop").addEventListener("click", closeEditor);
  $("saveSettings").addEventListener("click", saveSettings);
  ["ticketInput", "calledInput", "minutesInput", "pickupInput"].forEach(id => $(id).addEventListener("input", updateEditorSummary));
  $("notifyToggle").addEventListener("change", (event) => showToast(event.target.checked ? "已开启演示进度通知" : "已关闭演示进度通知"));
  document.querySelectorAll("[data-toast]").forEach(button => button.addEventListener("click", () => showToast(button.dataset.toast)));
  document.addEventListener("keydown", event => { if (event.key === "Escape" && !$("editorSheet").hidden) closeEditor(); });

  render(); updateClock(); setInterval(updateClock, 1000);
})();
