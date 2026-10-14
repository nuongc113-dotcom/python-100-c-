# 🚀 HỆ THỐNG ĐIỂM DANH & NHẬN DIỆN KHUÔN MẶT AI PRO (FULLSTACK)

Hệ thống hoàn chỉnh gồm 3 thành phần liên kết chặt chẽ:
1. **Frontend Web App (`Frontend/`)**: Giao diện người dùng hiện đại (HTML5 + Vanilla CSS + JS).
2. **AI Service (`FaceRecognitionAI/`)**: Dịch vụ AI Deep Learning (Python Flask + YuNet Face Detector + SFace 128D Embedding).
3. **Backend Service (`Backend/`)**: Máy chủ ASP.NET Core Web API (.NET 10 + EF Core + SQLite `attendance.db`).

---

## 🖥️ 3 Màn hình chính trong Web App:

### 1. Màn hình Điểm danh (Tab 1)
* Khung quét camera trực tiếp kèm hiệu ứng Scanner HUD hiện đại.
* **Nút "Quét khuôn mặt"** hoặc gạt bật chế độ **"Tự động quét"** (mỗi 1.5 giây quét 1 lần).
* Khi quét: Gửi ảnh sang **Python AI** xử lý so khớp vector $\rightarrow$ Khi khớp thành công:
  * Hiển thị Card kết quả với Tên nhân viên, Giờ vào, Độ khớp (%).
  * Tự động gửi API sang **C# Backend** ghi nhận lịch sử vào SQLite.
  * Tự động phát âm thanh chuông và **giọng nói tiếng Việt**: *"Điểm danh thành công! Xin chào [Tên]"*.
* Hiển thị bảng lịch sử các lượt điểm danh gần nhất.

### 2. Màn hình Đăng ký khuôn mặt (Tab 2)
* Nhập **Mã nhân viên** (ví dụ: `NV-001`, `IT-102`) và **Họ và tên** (ví dụ: `Phạm Giang`).
* Bật camera và bấm nút **Chụp Khuôn Mặt** (Snapshot).
* Bấm **Gửi lên Python AI & Lưu Database**:
  * Python AI dùng YuNet xác định 5 điểm mốc sinh trắc học và SFace trích xuất vector 128 chiều chuẩn hóa.
  * Tự động lưu ảnh vào `wwwroot/uploads/faces/` và lưu bản ghi vào bảng `People` trong SQLite của C# Backend.
  * Hiển thị thông báo Toast thành công hoặc lỗi chi tiết.

### 3. Màn hình Quản lý nhân sự (Tab 3)
* Hiển thị danh sách tất cả những người đã đăng ký tương ứng với cơ sở dữ liệu SQLite (`attendance.db`).
* Hiển thị Họ tên, Avatar, ID, Badge trạng thái Vector AI 128D, và mẫu chuỗi vector.
* Thanh tìm kiếm nhanh nhân viên theo tên hoặc mã.
* Nút Xóa nhân viên trực tiếp (đồng bộ xóa trong C# Backend).

---

## ⚡ Cách khởi chạy trên máy tính mới / Gửi cho bạn bè

### Bước 1: Chuẩn bị môi trường (Chỉ làm 1 lần đầu tiên)
Nhấp đúp chuột vào file:
👉 **`1_CAI_DAT_MOI_TRUONG.bat`**
*(File này sẽ tự động cài các thư viện Python: OpenCV, Flask, NumPy... và kiểm tra xem máy đã có .NET SDK chưa)*

> **Lưu ý quan trọng:**
> - Máy tính cần cài sẵn **Python** (tải tại [python.org](https://www.python.org/downloads/), nhớ tích chọn *"Add python.exe to PATH"*).
> - Backend C# cần **.NET SDK** (tải tại [dotnet.microsoft.com](https://dotnet.microsoft.com/download)).

### Bước 2: Chạy hệ thống
Nhấp đúp chuột vào file:
👉 **`2_CHAY_HE_THONG.bat`**
*(Hoặc mở Terminal gõ: `python run_system.py`)*

Lệnh này sẽ tự động:
1. Khởi chạy **C# Backend** tại `http://localhost:5286`.
2. Khởi chạy **Python AI Service** tại `http://localhost:5001`.
3. Khởi chạy **Frontend Web App** tại `http://localhost:8080`.
4. Tự động mở trình duyệt web hiển thị ứng dụng!
