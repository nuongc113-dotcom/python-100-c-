/**
 * ===================================================================
 * 🚀 JAVASCRIPT CONTROLLER - FACE ATTENDANCE AI PRO
 * ===================================================================
 * Tích hợp:
 *  1. Camera WebRTC HTML5
 *  2. Gửi ảnh sang Python AI (YuNet + SFace) tại port 5001
 *  3. Ghi nhận điểm danh & Quản lý danh sách sang C# Backend tại port 5286
 *  4. Âm thanh Web Audio & Giọng nói tiếng Việt Web Speech
 * ===================================================================
 */

// Cấu hình kết nối Localhost
const CONFIG = {
    AI_API_URL: "http://localhost:5001",     // Python AI Flask Service (YuNet + SFace)
    BACKEND_URL: "http://localhost:5286"    // ASP.NET Core C# Backend (.NET 10)
};

// Global State
let attendanceStream = null;
let registerStream = null;
let currentSnapshotBase64 = null;
let autoScanInterval = null;
let isScanning = false;
let peopleDatabase = [];

// ===================================================================
// 1. KHỞI TẠO VÀ ĐIỀU HƯỚNG TABS
// ===================================================================
document.addEventListener("DOMContentLoaded", () => {
    // Cập nhật đồng hồ thời gian thực
    updateLiveClock();
    setInterval(updateLiveClock, 1000);

    // Mặc định bật camera điểm danh
    initAttendanceCamera();

    // Kiểm tra kết nối 2 máy chủ
    checkServicesHealth();
    setInterval(checkServicesHealth, 8000);

    // Tải dữ liệu ban đầu
    loadPeopleList();
    loadAttendanceHistory();
});

function updateLiveClock() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString("vi-VN", { hour12: false });
    const clockEl = document.getElementById("live-clock");
    if (clockEl) clockEl.textContent = timeStr;
}

function switchTab(tabName) {
    // Ẩn tất cả tabs
    document.querySelectorAll(".tab-content").forEach(el => el.classList.remove("active"));
    document.querySelectorAll(".nav-tab").forEach(el => el.classList.remove("active"));

    // Kích hoạt tab được chọn
    const targetTab = document.getElementById(`tab-${tabName}`);
    const targetBtn = document.getElementById(`tab-btn-${tabName}`);
    if (targetTab) targetTab.classList.add("active");
    if (targetBtn) targetBtn.classList.add("active");

    // Xử lý camera khi đổi tab
    if (tabName === "attendance") {
        initAttendanceCamera();
        loadAttendanceHistory();
    } else if (tabName === "register") {
        initRegisterCamera();
    } else if (tabName === "management") {
        loadPeopleList();
        loadAttendanceHistory();
    }
}

// ===================================================================
// 2. QUẢN LÝ WEBCAM (HTML5 WebRTC)
// ===================================================================
async function initAttendanceCamera() {
    const video = document.getElementById("attendance-video");
    const offlineMask = document.getElementById("attendance-cam-offline");

    if (attendanceStream && attendanceStream.active) {
        if (offlineMask) offlineMask.style.display = "none";
        return;
    }

    try {
        attendanceStream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 960 }, height: { ideal: 540 } },
            audio: false
        });
        video.srcObject = attendanceStream;
        if (offlineMask) offlineMask.style.display = "none";
    } catch (err) {
        console.warn("Không thể mở camera điểm danh:", err);
        if (offlineMask) offlineMask.style.display = "flex";
    }
}

function toggleAttendanceCam() {
    const video = document.getElementById("attendance-video");
    const offlineMask = document.getElementById("attendance-cam-offline");

    if (attendanceStream) {
        attendanceStream.getTracks().forEach(track => track.stop());
        attendanceStream = null;
        video.srcObject = null;
        if (offlineMask) offlineMask.style.display = "flex";
        showToast("Đã tắt Camera điểm danh.", "info");
    } else {
        initAttendanceCamera();
    }
}

async function initRegisterCamera() {
    const video = document.getElementById("register-video");
    const offlineMask = document.getElementById("register-cam-offline");
    const offlineText = document.getElementById("register-cam-offline-text");

    if (registerStream && registerStream.active) {
        if (offlineMask) offlineMask.style.display = "none";
        return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        if (offlineMask) offlineMask.style.display = "flex";
        if (offlineText) {
            offlineText.innerHTML = "Trình duyệt chặn WebRTC qua HTTP nội bộ.<br>👉 <b>Hãy bấm nút 'Chụp Bằng Camera Điện Thoại' bên dưới</b> để chụp trực tiếp!";
        }
        return;
    }

    try {
        registerStream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 960 }, height: { ideal: 540 } },
            audio: false
        });
        video.srcObject = registerStream;
        if (offlineMask) offlineMask.style.display = "none";
    } catch (err) {
        console.warn("Không thể mở camera đăng ký:", err);
        if (offlineMask) offlineMask.style.display = "flex";
        if (offlineText) {
            offlineText.innerHTML = "Không thể mở webcam trực tiếp.<br>👉 <b>Bấm 'Chụp Bằng Camera Điện Thoại' bên dưới</b> để chụp selfie đăng ký!";
        }
    }
}

// ===================================================================
// 3. MÀN HÌNH ĐĂNG KÝ (SNAPSHOT & GỬI LÊN PYTHON AI)
// ===================================================================
function takeSnapshot() {
    const video = document.getElementById("register-video");
    const canvas = document.getElementById("register-canvas");
    const previewOverlay = document.getElementById("snapshot-preview-overlay");
    const previewImg = document.getElementById("snapshot-preview-img");
    const statusBox = document.getElementById("snapshot-status-box");
    const btnRetake = document.getElementById("btn-retake");
    const btnTake = document.getElementById("btn-take-snapshot");

    if (!video || !video.videoWidth) {
        showToast("Camera chưa sẵn sàng, vui lòng đợi bật camera!", "warning");
        return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Chuyển sang chuỗi Base64 JPEG chất lượng cao
    currentSnapshotBase64 = canvas.toDataURL("image/jpeg", 0.92);

    // Hiển thị ảnh chụp xem trước
    previewImg.src = currentSnapshotBase64;
    previewOverlay.style.display = "flex";

    statusBox.className = "snapshot-status-box ready";
    statusBox.innerHTML = '<i class="fa-solid fa-circle-check"></i> <span>Đã chụp ảnh khuôn mặt thành công! Bạn có thể gửi đăng ký.</span>';

    btnRetake.style.display = "inline-flex";
    btnTake.style.display = "none";

    playBeepSound(600, 100);
}

function retakeSnapshot() {
    const previewOverlay = document.getElementById("snapshot-preview-overlay");
    const statusBox = document.getElementById("snapshot-status-box");
    const btnRetake = document.getElementById("btn-retake");
    const btnTake = document.getElementById("btn-take-snapshot");

    currentSnapshotBase64 = null;
    previewOverlay.style.display = "none";

    statusBox.className = "snapshot-status-box";
    statusBox.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> <span>Chưa chụp ảnh khuôn mặt! Vui lòng bấm <b>Chụp Khuôn Mặt</b> trước khi đăng ký.</span>';

    btnRetake.style.display = "none";
    btnTake.style.display = "inline-flex";
    const fileInput = document.getElementById("input-file-face");
    if (fileInput) fileInput.value = "";
}

function handleFaceFileUpload(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
        showToast("Vui lòng chọn file hình ảnh hợp lệ (JPG, PNG)!", "warning");
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        currentSnapshotBase64 = e.target.result;

        const previewOverlay = document.getElementById("snapshot-preview-overlay");
        const previewImg = document.getElementById("snapshot-preview-img");
        const statusBox = document.getElementById("snapshot-status-box");
        const btnRetake = document.getElementById("btn-retake");
        const btnTake = document.getElementById("btn-take-snapshot");

        if (previewImg) previewImg.src = currentSnapshotBase64;
        if (previewOverlay) previewOverlay.style.display = "flex";

        if (statusBox) {
            statusBox.className = "snapshot-status-box ready";
            statusBox.innerHTML = '<i class="fa-solid fa-circle-check"></i> <span>Đã có ảnh khuôn mặt! Vui lòng nhập thông tin bên phải và bấm Gửi Đăng Ký.</span>';
        }

        if (btnRetake) btnRetake.style.display = "inline-flex";
        if (btnTake) btnTake.style.display = "none";
        showToast("Đã tải ảnh lên thành công. Sẵn sàng đăng ký!", "success");
    };
    reader.readAsDataURL(file);
}

async function handleRegisterSubmit(event) {
    event.preventDefault();

    const code = document.getElementById("reg-code").value.trim();
    const name = document.getElementById("reg-name").value.trim();
    const dept = document.getElementById("reg-dept").value;
    const submitBtn = document.getElementById("btn-submit-register");

    if (!name) {
        showToast("Vui lòng nhập họ và tên nhân viên!", "warning");
        return;
    }

    if (!currentSnapshotBase64) {
        showToast("Vui lòng chụp ảnh khuôn mặt trước khi gửi đăng ký!", "warning");
        return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> ĐANG TRÍCH XUẤT VECTOR AI & LƯU...';

    try {
        // Gửi ảnh sang Python AI Service để trích xuất 128D và lưu Database
        const response = await fetch(`${CONFIG.AI_API_URL}/api/ai/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                code: code,
                name: name,
                dept: dept,
                image: currentSnapshotBase64
            })
        });

        const result = await response.json();

        if (response.ok && result.success) {
            showToast(` Đăng ký thành công: ${name} (Mã: ${code})!`, "success");
            playSuccessChime();

            // Reset form
            document.getElementById("register-form").reset();
            retakeSnapshot();

            // Tải lại danh sách bên Quản lý
            loadPeopleList();
        } else {
            showToast(result.message || "Đăng ký thất bại. Vui lòng thử lại!", "danger");
            playErrorSound();
        }
    } catch (err) {
        console.error("Lỗi đăng ký:", err);
        showToast(`Không thể kết nối Python AI Server (${CONFIG.AI_API_URL})! Hãy chắc chắn bạn đã chạy ai_service.py.`, "danger");
        playErrorSound();
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> GỬI LÊN PYTHON AI & LƯU DATABASE';
    }
}

// ===================================================================
// 4. MÀN HÌNH ĐIỂM DANH (SCAN & RECOGNIZE & LOG TO C# BACKEND)
// ===================================================================
// Biến quản lý trạng thái lượt quét & chống đè kết quả người cũ
let scanSequence = 0;
let lastRecognizedPerson = { name: "", time: 0 };
let resetResultCardTimer = null;

async function performFaceScan() {
    if (isScanning) return;

    const video = document.getElementById("attendance-video");
    const canvas = document.getElementById("attendance-canvas");

    if (!video || !video.videoWidth) {
        showToast("Camera điểm danh chưa bật hoặc chưa sẵn sàng! Bạn có thể dùng nút 'Chụp Bằng Điện Thoại'.", "warning");
        return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const frameBase64 = canvas.toDataURL("image/jpeg", 0.90);
    await recognizeFrame(frameBase64);
}

async function handleAttendanceFileUpload(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async function(e) {
        const frameBase64 = e.target.result;
        await recognizeFrame(frameBase64);
    };
    reader.readAsDataURL(file);
    event.target.value = "";
}

async function recognizeFrame(frameBase64) {
    if (isScanning) return;

    const hud = document.getElementById("hud-overlay");
    const targetBox = document.getElementById("hud-target-box");
    const targetLabel = document.getElementById("hud-target-label");

    const currentSeq = ++scanSequence;
    isScanning = true;
    if (hud) hud.classList.add("scanning");
    if (targetLabel) targetLabel.textContent = "SCANNING...";

    // 1. NGAY LẬP TỨC XÓA TÊN NGƯỜI CŨ (để người mới không bao giờ thấy tên người trước)
    updateResultCardProcessing();

    try {
        // 2. Gửi ảnh sang Python AI Service (đã có RAM cache, phản hồi siêu tốc 20ms)
        const response = await fetch(`${CONFIG.AI_API_URL}/api/ai/recognize`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ image: frameBase64 })
        });

        // Nếu trong lúc chờ đã có lượt quét mới hơn, bỏ qua kết quả trễ này
        if (currentSeq !== scanSequence) {
            return;
        }

        const result = await response.json();

        if (result.success && result.isMatched) {
            // Nhận diện thành công
            if (targetBox) targetBox.className = "hud-target-box matched";
            if (targetLabel) targetLabel.textContent = `MATCHED: ${result.name.toUpperCase()}`;

            const nowTs = Date.now();
            const now = new Date();
            const timeStr = now.toLocaleTimeString("vi-VN", { hour12: false });

            // Kiểm tra chống spam điểm danh & giọng nói cho cùng 1 người trong 4 giây
            const isSamePersonRecent = (lastRecognizedPerson.name === result.name && (nowTs - lastRecognizedPerson.time < 4000));

            if (!isSamePersonRecent) {
                lastRecognizedPerson = { name: result.name, time: nowTs };
                playSuccessChime();
                speakWelcome(result.name);
                recordAttendanceToBackend(result.personId, result.name, result.confidence, "Đúng giờ");
                loadAttendanceHistory();
            }

            // Cập nhật thẻ kết quả người này
            updateResultCard({
                isSuccess: true,
                name: result.name,
                msg: `Điểm danh thành công! Độ khớp: ${result.confidence}% (Cosine: ${result.cosine})`,
                time: timeStr,
                confidence: `${result.confidence}%`,
                id: result.personId || "--"
            });

            // 3. TỰ ĐỘNG RESET VỀ "SẴN SÀNG" SAU 3.5 GIÂY ĐỂ NGƯỜI TIẾP THEO BƯỚC VÀO
            if (resetResultCardTimer) clearTimeout(resetResultCardTimer);
            resetResultCardTimer = setTimeout(() => {
                resetResultCardToReady();
            }, 3500);

        } else if (result.faceFound === false) {
            // Không phát hiện khuôn mặt nào trong khung hình
            if (targetBox) targetBox.className = "hud-target-box";
            if (targetLabel) targetLabel.textContent = "NO FACE DETECTED";

            if (!autoScanInterval) {
                // Chỉ hiện thông báo nhắc nhở khi người dùng bấm thủ công
                updateResultCard({
                    statusType: "info",
                    name: "Chưa thấy khuôn mặt",
                    msg: "Vui lòng đứng thẳng, nhìn vào camera và đảm bảo đủ ánh sáng.",
                    time: "--:--:--",
                    confidence: "0%",
                    id: "--"
                });
            } else {
                // Tự động quét: nếu không có ai trước camera thì để ở trạng thái SẴN SÀNG
                resetResultCardToReady();
            }

        } else {
            // Có khuôn mặt nhưng KHÔNG KHỚP với bất kỳ ai trong CSDL (Người lạ)
            if (targetBox) targetBox.className = "hud-target-box unmatched";
            if (targetLabel) targetLabel.textContent = "UNKNOWN FACE";
            
            if (!autoScanInterval) {
                playErrorSound();
            }

            updateResultCard({
                statusType: "danger",
                name: "Người lạ / Unknown",
                msg: "Khuôn mặt chưa được đăng ký trong hệ thống!",
                time: "--:--:--",
                confidence: `${result.confidence || 0}%`,
                id: "N/A"
            });

            // Tự động reset về trạng thái chờ sau 2.5 giây
            if (resetResultCardTimer) clearTimeout(resetResultCardTimer);
            resetResultCardTimer = setTimeout(() => {
                resetResultCardToReady();
            }, 2500);
        }
    } catch (err) {
        console.error("Lỗi quét điểm danh:", err);
        if (targetBox) targetBox.className = "hud-target-box unmatched";
        if (targetLabel) targetLabel.textContent = "SERVER ERROR";
        updateResultCard({
            statusType: "danger",
            name: "Lỗi kết nối",
            msg: `Không kết nối được Python AI (${CONFIG.AI_API_URL})!`,
            time: "--:--:--",
            confidence: "0%",
            id: "--"
        });
    } finally {
        if (hud) hud.classList.remove("scanning");
        if (!autoScanInterval && targetLabel && targetLabel.textContent === "SCANNING...") {
            if (targetBox) targetBox.className = "hud-target-box";
            targetLabel.textContent = "READY";
        }
        isScanning = false;
    }
}

function updateResultCardProcessing() {
    const card = document.getElementById("result-card");
    const badge = document.getElementById("result-status-badge");
    const nameEl = document.getElementById("result-name");
    const msgEl = document.getElementById("result-msg");
    const metrics = document.getElementById("result-metrics");

    if (card) card.className = "result-card";
    if (badge) {
        badge.className = "result-badge badge-idle";
        badge.textContent = "ĐANG XỬ LÝ...";
    }
    if (nameEl) nameEl.textContent = "Đang nhận diện khuôn mặt...";
    if (msgEl) msgEl.textContent = "Vui lòng nhìn thẳng vào camera...";
    if (metrics) metrics.style.display = "none";
}

function resetResultCardToReady() {
    const card = document.getElementById("result-card");
    const badge = document.getElementById("result-status-badge");
    const nameEl = document.getElementById("result-name");
    const msgEl = document.getElementById("result-msg");
    const metrics = document.getElementById("result-metrics");
    const targetBox = document.getElementById("hud-target-box");
    const targetLabel = document.getElementById("hud-target-label");

    if (card) card.className = "result-card";
    if (badge) {
        badge.className = "result-badge badge-idle";
        badge.textContent = "SẴN SÀNG";
    }
    if (nameEl) nameEl.textContent = "Sẵn sàng điểm danh";
    if (msgEl) msgEl.textContent = "Mời người tiếp theo bước vào khung hình camera";
    if (metrics) metrics.style.display = "none";
    if (targetBox) targetBox.className = "hud-target-box";
    if (targetLabel) targetLabel.textContent = "READY";
}

function toggleAutoScan(enabled) {
    if (enabled) {
        showToast("Đã bật chế độ Tự Động Quét Điểm Danh (mỗi 1.5 giây).", "info");
        performFaceScan();
        autoScanInterval = setInterval(() => {
            if (!isScanning) performFaceScan();
        }, 1500);
    } else {
        if (autoScanInterval) {
            clearInterval(autoScanInterval);
            autoScanInterval = null;
        }
        showToast("Đã tắt chế độ Tự Động Quét.", "info");
    }
}

function updateResultCard({ isSuccess, statusType, name, msg, time, confidence, id }) {
    const card = document.getElementById("result-card");
    const badge = document.getElementById("result-status-badge");
    const nameEl = document.getElementById("result-name");
    const msgEl = document.getElementById("result-msg");
    const metrics = document.getElementById("result-metrics");
    const timeEl = document.getElementById("res-time");
    const confEl = document.getElementById("res-confidence");
    const idEl = document.getElementById("res-id");

    const type = statusType || (isSuccess === true ? "success" : isSuccess === false ? "danger" : "info");

    if (type === "success") {
        card.className = "result-card success-border";
        badge.className = "result-badge badge-success";
        badge.textContent = "ĐIỂM DANH THÀNH CÔNG";
        metrics.style.display = "flex";
    } else if (type === "danger") {
        card.className = "result-card danger-border";
        badge.className = "result-badge badge-danger";
        badge.textContent = "CHƯA ĐĂNG KÝ";
        metrics.style.display = "flex";
    } else {
        card.className = "result-card";
        badge.className = "result-badge badge-idle";
        badge.textContent = "THÔNG BÁO";
        metrics.style.display = "none";
    }

    nameEl.textContent = name;
    msgEl.textContent = msg;
    timeEl.textContent = time;
    confEl.textContent = confidence;
    idEl.textContent = id;
}

// Gửi ghi nhận điểm danh sang C# Backend
async function recordAttendanceToBackend(personId, personName, confidence, status) {
    try {
        await fetch(`${CONFIG.BACKEND_URL}/api/attendance/checkin`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                personId: personId,
                personName: personName,
                confidence: confidence,
                status: status
            })
        });
    } catch (err) {
        console.warn("Không thể gửi checkin sang C# Backend:", err);
    }
}

let attendanceHistoryData = [];

// Lấy lịch sử điểm danh từ C# Backend (Fallback sang Python AI SQLite nếu C# bận)
async function loadAttendanceHistory() {
    const tbodyMini = document.getElementById("attendance-history-tbody");
    const tbodyFull = document.getElementById("full-history-tbody");
    const statToday = document.getElementById("stat-today-attendance");

    let list = null;

    // 1. Thử lấy từ C# Backend
    try {
        const res = await fetch(`${CONFIG.BACKEND_URL}/api/attendance/history?limit=100`);
        if (res.ok) {
            list = await res.json();
        }
    } catch (err) {
        // C# Backend chưa sẵn sàng, chuyển sang fallback
    }

    // 2. Fallback trực tiếp sang Python AI Service (đọc thẳng SQLite)
    if (!list || list.length === 0) {
        try {
            const resAi = await fetch(`${CONFIG.AI_API_URL}/api/ai/history?limit=100`);
            if (resAi.ok) {
                list = await resAi.json();
            }
        } catch (err) {}
    }

    if (!list || list.length === 0) {
        if (tbodyMini) tbodyMini.innerHTML = '<tr><td colspan="5" class="text-center empty-state">Chưa có lượt điểm danh nào trong CSDL.</td></tr>';
        if (tbodyFull) tbodyFull.innerHTML = '<tr><td colspan="6" class="text-center empty-state">Chưa có dữ liệu điểm danh nào trong CSDL SQLite.</td></tr>';
        if (statToday) statToday.textContent = 0;
        return;
    }

    attendanceHistoryData = list;

    // 3. Hiển thị ở Tab 1 (Bảng nhỏ 10 dòng gần nhất bên cạnh camera)
    if (tbodyMini) {
        tbodyMini.innerHTML = list.slice(0, 10).map(item => `
            <tr>
                <td><strong>${escapeHtml(item.personName)}</strong></td>
                <td><span class="font-mono">${item.time || "--:--:--"}</span></td>
                <td>${item.date || ""}</td>
                <td><span class="tag-success">${item.confidence}%</span></td>
                <td><span class="badge-success" style="padding: 2px 8px; border-radius: 4px; font-size: 11px;">${item.status || "Hợp lệ"}</span></td>
            </tr>
        `).join("");
    }

    // 4. Hiển thị ở Tab 3 (Bảng chi tiết toàn bộ lịch sử)
    renderFullHistoryTable(attendanceHistoryData);

    // 5. Cập nhật thống kê
    if (statToday) statToday.textContent = list.length;
}

function renderFullHistoryTable(list) {
    const tbodyFull = document.getElementById("full-history-tbody");
    if (!tbodyFull) return;

    if (!list || list.length === 0) {
        tbodyFull.innerHTML = '<tr><td colspan="6" class="text-center empty-state">Không tìm thấy lượt điểm danh nào phù hợp.</td></tr>';
        return;
    }

    tbodyFull.innerHTML = list.map((item, index) => `
        <tr>
            <td><strong>#${index + 1}</strong></td>
            <td><strong style="font-size: 14px;">${escapeHtml(item.personName)}</strong></td>
            <td><span class="font-mono" style="color: var(--primary); font-weight: 600;">${item.time || "--:--:--"}</span></td>
            <td>${item.date || ""}</td>
            <td><span class="tag-success">${item.confidence}%</span></td>
            <td><span class="badge-success" style="padding: 3px 10px; border-radius: 9999px; font-size: 11px;"><i class="fa-solid fa-check"></i> ${item.status || "Hợp lệ"}</span></td>
        </tr>
    `).join("");
}

function filterHistoryTable() {
    const input = document.getElementById("history-search-input");
    const query = input ? input.value.toLowerCase().trim() : "";
    if (!query) {
        renderFullHistoryTable(attendanceHistoryData);
        return;
    }

    const filtered = attendanceHistoryData.filter(item => 
        (item.personName && item.personName.toLowerCase().includes(query)) ||
        (item.date && item.date.includes(query)) ||
        (item.time && item.time.includes(query))
    );
    renderFullHistoryTable(filtered);
}

// ===================================================================
// 5. MÀN HÌNH QUẢN LÝ NHÂN SỰ (CSDL SQLITE QUA C# BACKEND)
// ===================================================================
async function loadPeopleList() {
    const tbody = document.getElementById("people-table-tbody");
    const countPill = document.getElementById("people-count-pill");
    const statTotal = document.getElementById("stat-total-people");
    const statVector = document.getElementById("stat-vector-people");

    try {
        // Lấy danh sách trực tiếp từ C# Backend
        const res = await fetch(`${CONFIG.BACKEND_URL}/api/people`);
        if (!res.ok) throw new Error("Backend response not ok");

        const people = await res.json();
        peopleDatabase = people;

        countPill.textContent = people.length;
        if (statTotal) statTotal.textContent = people.length;
        if (statVector) statVector.textContent = people.filter(p => p.faceVectorJson && p.faceVectorJson.length > 50).length;

        renderPeopleTable(people);

    } catch (err) {
        console.warn("Không thể tải từ C# Backend:", err);
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center empty-state" style="color: var(--danger);">
                    ⚠️ Chưa kết nối được với C# Backend (${CONFIG.BACKEND_URL}). Hãy đảm bảo bạn đã khởi động Backend!
                </td>
            </tr>
        `;
    }
}

function renderPeopleTable(list) {
    const tbody = document.getElementById("people-table-tbody");

    if (!list || list.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center empty-state">Cơ sở dữ liệu SQLite chưa có nhân viên nào. Hãy qua tab Đăng Ký để thêm!</td></tr>';
        return;
    }

    tbody.innerHTML = list.map(person => {
        const hasVector = person.faceVectorJson && person.faceVectorJson.length > 50;
        const vecPreview = hasVector ? person.faceVectorJson.substring(0, 32) + "..." : "Trống";

        return `
            <tr>
                <td><strong>#${person.id}</strong></td>
                <td>
                    <div class="user-avatar-thumb">
                        <i class="fa-solid fa-user"></i>
                    </div>
                </td>
                <td><strong style="font-size: 15px;">${escapeHtml(person.name)}</strong></td>
                <td>
                    ${hasVector 
                        ? '<span class="badge-online" style="padding: 4px 10px; font-size: 11px; border-radius: 9999px;"><i class="fa-solid fa-check"></i> 128D Vector Chuẩn</span>' 
                        : '<span class="badge-offline" style="padding: 4px 10px; font-size: 11px; border-radius: 9999px;">Chưa có</span>'
                    }
                </td>
                <td><code class="vector-snippet" title="${escapeHtml(person.faceVectorJson)}">${vecPreview}</code></td>
                <td>
                    <button class="btn-icon-danger" title="Xóa nhân viên" onclick="deletePerson(${person.id}, '${escapeHtml(person.name)}')">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join("");
}

function filterPeopleTable() {
    const query = document.getElementById("search-input").value.toLowerCase().trim();
    if (!query) {
        renderPeopleTable(peopleDatabase);
        return;
    }

    const filtered = peopleDatabase.filter(p => 
        (p.name && p.name.toLowerCase().includes(query)) ||
        (p.id && p.id.toString().includes(query))
    );
    renderPeopleTable(filtered);
}

async function deletePerson(id, name) {
    if (!confirm(`Bạn có chắc chắn muốn xóa nhân viên "${name}" (ID: #${id}) khỏi cơ sở dữ liệu?`)) {
        return;
    }

    try {
        const res = await fetch(`${CONFIG.BACKEND_URL}/api/people/${id}`, {
            method: "DELETE"
        });

        if (res.ok) {
            showToast(`Đã xóa thành công nhân viên "${name}".`, "success");
            loadPeopleList();
        } else {
            showToast("Không thể xóa nhân viên này!", "danger");
        }
    } catch (err) {
        showToast("Lỗi kết nối khi xóa nhân viên!", "danger");
    }
}

// ===================================================================
// 6. HEALTH CHECK VÀ THÔNG BÁO HỆ THỐNG
// ===================================================================
async function checkServicesHealth() {
    // 1. Kiểm tra Python AI Service (Port 5001)
    const aiBadge = document.getElementById("ai-status-badge");
    const aiText = document.getElementById("ai-status-text");
    try {
        const res = await fetch(`${CONFIG.AI_API_URL}/api/ai/health`, { timeout: 2000 });
        if (res.ok) {
            aiBadge.className = "badge badge-online";
            aiText.textContent = "Online (5001)";
        } else {
            throw new Error();
        }
    } catch (e) {
        aiBadge.className = "badge badge-offline";
        aiText.textContent = "Offline (5001)";
    }

    // 2. Kiểm tra C# Backend: Tự động hỗ trợ cả Port 5286 (Kestrel) và Port 61642 (IIS Express)
    const beBadge = document.getElementById("backend-status-badge");
    const beText = document.getElementById("backend-status-text");
    
    let backendActive = false;
    const candidatePorts = [5286, 61642];

    for (const port of candidatePorts) {
        try {
            const testUrl = `http://localhost:${port}`;
            const res = await fetch(`${testUrl}/api/people`, { timeout: 1500 });
            if (res.ok) {
                CONFIG.BACKEND_URL = testUrl;
                beBadge.className = "badge badge-online";
                beText.textContent = `Online (${port === 61642 ? "IIS: " : ""}${port})`;
                backendActive = true;
                break;
            }
        } catch (e) {}
    }

    if (!backendActive) {
        beBadge.className = "badge badge-offline";
        beText.textContent = "Offline";
    }
}

function showToast(message, type = "info") {
    const container = document.getElementById("toast-container");
    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;

    let icon = "fa-circle-info";
    if (type === "success") icon = "fa-circle-check";
    if (type === "danger") icon = "fa-circle-xmark";
    if (type === "warning") icon = "fa-triangle-exclamation";

    toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transform = "translateX(50px)";
        toast.style.transition = "all 0.3s ease";
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// ===================================================================
// 7. ÂM THANH VÀ GIỌNG NÓI TIẾNG VIỆT
// ===================================================================
function playSuccessChime() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
        osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.1); // E5
        osc.frequency.setValueAtTime(783.99, ctx.currentTime + 0.2); // G5

        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);

        osc.start();
        osc.stop(ctx.currentTime + 0.5);
    } catch (e) {}
}

function playErrorSound() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(220, ctx.currentTime);
        osc.frequency.setValueAtTime(160, ctx.currentTime + 0.15);

        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);

        osc.start();
        osc.stop(ctx.currentTime + 0.35);
    } catch (e) {}
}

function playBeepSound(freq = 440, duration = 100) {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + (duration / 1000));

        osc.start();
        osc.stop(ctx.currentTime + (duration / 1000));
    } catch (e) {}
}

function speakWelcome(name) {
    if (!('speechSynthesis' in window)) return;
    try {
        // Rút gọn lấy tên chính (loại bỏ mã nhân viên như "NV-001 - Pham Giang" -> "Pham Giang")
        let cleanName = name;
        if (cleanName.includes("-")) {
            cleanName = cleanName.split("-").slice(1).join("-").trim();
        }

        const utterance = new SpeechSynthesisUtterance(`Điểm danh thành công! Xin chào ${cleanName}`);
        utterance.lang = "vi-VN";
        utterance.rate = 1.0;
        window.speechSynthesis.speak(utterance);
    } catch (e) {}
}

function escapeHtml(text) {
    if (!text) return "";
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
