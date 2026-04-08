import { useEffect, useMemo, useRef, useState } from "react";
import ApartmentDetailPage from "./ApartmentDetailPage.jsx";

/** Mặc định gọi thẳng backend (port 5000). Override: tạo `frontend/.env` với VITE_API_BASE_URL=http://... */
const API_BASE_URL = (() => {
  const fromEnv = import.meta.env.VITE_API_BASE_URL;
  if (fromEnv) return String(fromEnv).replace(/\/$/, "");
  return "http://localhost:5000";
})();
const APARTMENT_TYPES = [
  "1BR (1 Bedroom)",
  "2BR (2 Bedroom)",
  "3BR (3 Bedroom)",
  "4BR (4 Bedroom)",
];
const APARTMENT_CONDITIONS = ["trống", "bếp rèm", "full"];

const toAssetUrl = (url) => {
  if (!url) return "";
  if (url.startsWith("http")) return url;
  const normalized = String(url).replace(/\\/g, "/");
  const uploadsIndex = normalized.indexOf("uploads/");
  const relative = uploadsIndex >= 0 ? normalized.slice(uploadsIndex) : normalized;
  const base = API_BASE_URL || "";
  const prefix = base ? `${base}/` : "/";
  return `${prefix}${relative}`.replace(/([^:]\/)\/+/g, "$1");
};

const toRelativeTime = (value) => {
  const ts = new Date(value).getTime();
  if (Number.isNaN(ts)) return "Updated recently";
  const diffSec = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  if (diffSec < 60) return `Updated ${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `Updated ${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `Updated ${diffHour}h ago`;
  const diffDay = Math.floor(diffHour / 24);
  return `Updated ${diffDay} day${diffDay > 1 ? "s" : ""} ago`;
};

/** Ngày đăng sớm nhất (ảnh đầu tiên trong nhóm). */
const formatPostedDate = (value) => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("vi-VN", { day: "2-digit", month: "short", year: "numeric" });
};

const earliestTimestamp = (items) => {
  let min = null;
  for (const img of items) {
    const t = new Date(img.createdAt || img.updatedAt || 0).getTime();
    if (Number.isNaN(t)) continue;
    min = min === null ? t : Math.min(min, t);
  }
  return min;
};

const mapToApartments = (images) => {
  const grouped = new Map();
  images.forEach((img) => {
    const code = String(img.apartmentCode ?? "").trim();
    const key = code || String(img._id ?? "");
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(img);
  });

  return Array.from(grouped.entries()).map(([key, items]) => {
    const sortedItems = [...items].sort(
      (a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0),
    );
    const latest = sortedItems[0];
    const name = latest.apartmentCode || key;
    const suffix = latest.apartmentType ? ` - ${latest.apartmentType}` : "";
    const firstPostTs = earliestTimestamp(items);
    return {
      id: key,
      name: `${name}${suffix}`,
      photos: `${items.length} photos`,
      updated: toRelativeTime(latest.updatedAt || latest.createdAt),
      postedDate: firstPostTs != null ? formatPostedDate(firstPostTs) : "—",
      image: toAssetUrl(latest.url),
      featured: false,
      price: latest.price || "",
      saleName: latest.saleName || "",
      items: sortedItems,
    };
  });
};

function ApartmentCard({ apartment, onOpenGallery, onUploadMore }) {
  const openDetail = () => onOpenGallery?.(apartment);

  const onCardKeyDown = (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openDetail();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={openDetail}
      onKeyDown={onCardKeyDown}
      className="group cursor-pointer overflow-hidden rounded-xl bg-surface-container-lowest shadow-sm transition-all duration-300 hover:scale-[1.02] hover:shadow-xl hover:shadow-slate-200/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
    >
      <div className="relative aspect-[16/10] overflow-hidden">
        <img className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110" src={apartment.image} alt={apartment.name} />
        {apartment.featured ? (
          <div className="absolute right-4 top-4 rounded-full bg-white/80 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-cyan-800 backdrop-blur-md">
            Featured
          </div>
        ) : null}
      </div>
      <div className="p-6">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h3 className="text-xl font-bold text-on-surface transition-colors group-hover:text-primary">{apartment.name}</h3>
            <div className="mt-1 flex items-center gap-2">
              <span className="material-symbols-outlined text-base text-on-surface-variant">photo_library</span>
              <span className="text-sm text-on-surface-variant">{apartment.photos}</span>
            </div>
            <div className="mt-1.5 flex items-center gap-1.5 text-xs text-on-surface-variant">
              <span className="material-symbols-outlined text-[16px] text-on-surface-variant/80">calendar_today</span>
              <span>
                Đăng: <span className="font-medium text-on-surface">{apartment.postedDate}</span>
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={(e) => e.stopPropagation()}
            className="rounded-full p-2 text-on-surface-variant transition-colors hover:bg-slate-100"
          >
            <span className="material-symbols-outlined">edit</span>
          </button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-surface-container pt-4">
          <span className="text-xs font-medium text-on-surface-variant">{apartment.updated}</span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onUploadMore?.(apartment);
            }}
            className="rounded-full px-4 py-2 text-xs font-bold text-primary transition-colors hover:bg-primary-container"
          >
            UPLOAD MORE
          </button>
        </div>
      </div>
    </div>
  );
}

function ManagePage({ apartments, loading, error, onRefresh, onOpenUpload, onOpenGallery, onUploadMoreFromCard }) {
  return (
    <main className="mx-auto mt-20 w-full max-w-7xl px-8 pb-16 pt-2">
      <div className="mb-10 flex flex-col gap-6 sm:mb-12 lg:flex-row lg:items-end lg:justify-between lg:gap-8">
        <div className="min-w-0 flex-1">
          <h1 className="mb-2 text-4xl font-extrabold tracking-tight text-on-surface">Managed Apartments</h1>
          <p className="max-w-xl leading-relaxed text-on-surface-variant">
            Organize and curate your premium architectural portfolio. Manage metadata and galleries for all active listings.
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenUpload}
          className="flex shrink-0 items-center justify-center gap-2 self-start rounded-full bg-primary px-8 py-4 font-semibold text-on-primary shadow-xl shadow-primary/10 transition-all duration-300 hover:-translate-y-[2px] lg:self-auto"
        >
          <span className="material-symbols-outlined">add_business</span>
          Add New Apartment
        </button>
      </div>

      <div className="mb-8 flex flex-wrap items-center gap-4">
        <div className="rounded-full bg-surface-container-lowest px-6 py-2 text-sm font-medium text-primary shadow-sm">
          All ({apartments.length})
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2 text-on-surface-variant">
          <button
            type="button"
            onClick={onRefresh}
            className="flex items-center gap-1 rounded-full border border-surface-container px-4 py-2 text-sm font-semibold text-on-surface"
          >
            <span className="material-symbols-outlined text-base">refresh</span>
            Refresh
          </button>
        </div>
      </div>

      {loading ? <p className="text-sm text-on-surface-variant">Loading apartments...</p> : null}
      {error ? <p className="text-sm text-error">{error}</p> : null}

      {!loading && apartments.length === 0 ? (
        <div className="rounded-xl bg-surface-container-low p-8 text-sm text-on-surface-variant">
          Chưa có dữ liệu. Hãy upload ảnh ở màn Uploads để tạo căn hộ.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
          {apartments.map((apartment) => (
            <ApartmentCard
              key={apartment.id}
              apartment={apartment}
              onOpenGallery={onOpenGallery}
              onUploadMore={onUploadMoreFromCard}
            />
          ))}
        </div>
      )}

      <div className="mt-20 flex flex-col items-center gap-6">
        <div className="h-[2px] w-24 rounded-full bg-surface-container-highest" />
        <button className="group flex flex-col items-center gap-2 text-on-surface-variant transition-colors hover:text-primary">
          <span className="text-xs font-bold uppercase tracking-[0.2em]">Load More Apartments</span>
          <span className="material-symbols-outlined animate-bounce">expand_more</span>
        </button>
        <div className="mt-4 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-bold text-on-primary">1</div>
          <div className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-xs font-bold transition-colors hover:bg-surface-container-high">
            2
          </div>
          <div className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-xs font-bold transition-colors hover:bg-surface-container-high">
            3
          </div>
          <div className="px-2 text-on-surface-variant">...</div>
          <div className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-xs font-bold transition-colors hover:bg-surface-container-high">
            12
          </div>
        </div>
      </div>
    </main>
  );
}

function UploadPage({ onUploaded }) {
  const inputRef = useRef(null);
  const [aiNotes, setAiNotes] = useState("");
  const [listingDescription, setListingDescription] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [apartmentCode, setApartmentCode] = useState("");
  const [saleName, setSaleName] = useState("");
  const [price, setPrice] = useState("");
  const [apartmentType, setApartmentType] = useState(APARTMENT_TYPES[0]);
  const [apartmentCondition, setApartmentCondition] = useState(APARTMENT_CONDITIONS[0]);
  const [files, setFiles] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState("");

  const previewImages = useMemo(
    () =>
      files.map((file) => ({
        name: file.name,
        image: URL.createObjectURL(file),
      })),
    [files],
  );

  useEffect(
    () => () => {
      previewImages.forEach((item) => URL.revokeObjectURL(item.image));
    },
    [previewImages],
  );

  const onSelectFiles = (event) => {
    const selected = Array.from(event.target.files || []);
    if (selected.length === 0) return;
    setFiles((prev) => [...prev, ...selected]);
  };

  const removeFile = (name) => setFiles((prev) => prev.filter((file) => file.name !== name));
  const clearFiles = () => setFiles([]);
  const hasRequiredInfo =
    apartmentCode.trim() &&
    saleName.trim() &&
    price.trim() &&
    apartmentType.trim() &&
    apartmentCondition.trim();
  const canSubmit = Boolean(hasRequiredInfo && files.length > 0 && !submitting);
  const canRunGemini = Boolean((aiNotes.trim() || files.length > 0) && !aiLoading && !submitting);

  const fillFormFromGemini = async () => {
    setAiError("");
    if (!aiNotes.trim() && files.length === 0) {
      setAiError("Nhập ghi chú hoặc chọn ảnh trước khi gọi Gemini.");
      return;
    }
    setAiLoading(true);
    try {
      const formData = new FormData();
      formData.append("notes", aiNotes.trim());
      files.forEach((file) => formData.append("images", file, file.name));

      const response = await fetch(`${API_BASE_URL}/api/ai/suggest-listing`, {
        method: "POST",
        body: formData,
      });
      const raw = await response.text();
      let data = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        data = { error: raw ? raw.replace(/<[^>]+>/g, " ").slice(0, 280).trim() : "" };
      }
      if (!response.ok) {
        throw new Error(data.error || `Gemini lỗi (${response.status})`);
      }
      setApartmentCode(String(data.apartmentCode ?? ""));
      setSaleName(String(data.saleName ?? ""));
      setPrice(String(data.price ?? ""));
      setApartmentType(APARTMENT_TYPES.includes(data.apartmentType) ? data.apartmentType : APARTMENT_TYPES[1]);
      setApartmentCondition(
        APARTMENT_CONDITIONS.includes(data.apartmentCondition) ? data.apartmentCondition : APARTMENT_CONDITIONS[0],
      );
      setListingDescription(String(data.description ?? ""));
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "Không gọi được Gemini.");
    } finally {
      setAiLoading(false);
    }
  };

  const submitForm = async () => {
    setSubmitError("");
    setSubmitSuccess("");

    if (!apartmentCode.trim() || !saleName.trim() || !price.trim() || !apartmentType.trim() || !apartmentCondition.trim()) {
      setSubmitError("Vui lòng nhập đầy đủ Mã căn hộ, Tên sales, Giá tiền, Loại căn hộ, Loại căn.");
      return;
    }

    if (files.length === 0) {
      setSubmitError("Vui lòng chọn ít nhất 1 ảnh để upload.");
      return;
    }

    setSubmitting(true);
    try {
      await Promise.all(
        files.map(async (file) => {
          const formData = new FormData();
          // Đặt field text trước file — nếu không Multer/Express có thể không gán vào req.body,
          // khiến apartmentCode rỗng và mỗi ảnh bị group theo _id (mỗi card 1 hình).
          formData.append("apartmentCode", apartmentCode.trim());
          formData.append("saleName", saleName.trim());
          formData.append("price", price.trim());
          formData.append("apartmentType", apartmentType.trim());
          formData.append("apartmentCondition", apartmentCondition.trim());
          formData.append(
            "description",
            listingDescription.trim() || `${apartmentCode.trim()} - ${apartmentType.trim()}`,
          );
          formData.append("image", file, file.name);

          const response = await fetch(`${API_BASE_URL}/api/images/upload`, {
            method: "POST",
            body: formData,
          });

          if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.error || "Upload failed");
          }
        }),
      );

      setSubmitSuccess(`Đã upload ${files.length} ảnh thành công.`);
      clearFiles();
      onUploaded();
    } catch (error) {
      setSubmitError(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <main className="mx-auto mt-20 w-full max-w-7xl flex-1 px-8 pb-32 pt-2">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-2 lg:gap-12">
          <section className="space-y-8 lg:min-w-0">
            <div className="flex flex-col gap-2">
              <h2 className="text-3xl font-bold tracking-tight text-on-background">Property Details</h2>
              <p className="text-on-surface-variant">Enter the fundamental specifications of the listing.</p>
            </div>

            <div className="space-y-3 rounded-xl border border-outline-variant/20 bg-surface-container-lowest p-6 shadow-sm">
              <label className="ml-1 text-xs font-semibold uppercase tracking-widest text-on-surface-variant">
                Ghi chú cho AI (Gemini)
              </label>
              <textarea
                className="w-full min-h-[9rem] resize-y rounded-2xl border border-outline-variant/30 bg-surface-container-high px-4 py-3 text-sm text-on-surface placeholder:text-outline-variant focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder={`Dự án: VHCP\n- Mã căn: P4-03.07\n- Giá: 60 triệu Net\n- ...`}
                value={aiNotes}
                onChange={(e) => setAiNotes(e.target.value)}
              />
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={!canRunGemini}
                  onClick={() => void fillFormFromGemini()}
                  className="flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary shadow-sm transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-lg">auto_awesome</span>
                  {aiLoading ? "Đang gọi Gemini..." : "Điền form bằng Gemini"}
                </button>
                <span className="text-xs text-on-surface-variant">Cần API key: backend/.env → GEMINI_API_KEY</span>
              </div>
              {aiError ? <p className="text-sm text-error">{aiError}</p> : null}
            </div>

            <div className="space-y-6 rounded-xl bg-surface-container-low p-8">
              <div className="space-y-2">
                <label className="ml-1 text-xs font-semibold uppercase tracking-widest text-on-surface-variant">Mã căn hộ</label>
                <input
                  className="w-full rounded-full border-none bg-surface-container-high px-6 py-4 text-on-surface transition-all placeholder:text-outline-variant focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary"
                  placeholder="e.g. VIN-CP-1204"
                  type="text"
                  value={apartmentCode}
                  onChange={(e) => setApartmentCode(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="ml-1 text-xs font-semibold uppercase tracking-widest text-on-surface-variant">Tên Sales</label>
                <input
                  className="w-full rounded-full border-none bg-surface-container-high px-6 py-4 text-on-surface transition-all placeholder:text-outline-variant focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary"
                  placeholder="Enter salesperson name"
                  type="text"
                  value={saleName}
                  onChange={(e) => setSaleName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="ml-1 text-xs font-semibold uppercase tracking-widest text-on-surface-variant">Giá tiền</label>
                <input
                  className="w-full rounded-full border-none bg-surface-container-high px-6 py-4 text-on-surface transition-all placeholder:text-outline-variant focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary"
                  placeholder="Ví dụ: 2.000.000.000"
                  type="text"
                  inputMode="decimal"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="ml-1 text-xs font-semibold uppercase tracking-widest text-on-surface-variant">Loại căn hộ</label>
                <div className="relative">
                  <select
                    className="w-full appearance-none cursor-pointer rounded-full border-none bg-surface-container-high px-6 py-4 text-on-surface transition-all focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary"
                    value={apartmentType}
                    onChange={(e) => setApartmentType(e.target.value)}
                  >
                    {APARTMENT_TYPES.map((type) => (
                      <option key={type}>{type}</option>
                    ))}
                  </select>
                  <span className="material-symbols-outlined pointer-events-none absolute right-5 top-1/2 -translate-y-1/2 text-outline">
                    expand_more
                  </span>
                </div>
              </div>
              <div className="space-y-2">
                <label className="ml-1 text-xs font-semibold uppercase tracking-widest text-on-surface-variant">Loại căn</label>
                <div className="relative">
                  <select
                    className="w-full appearance-none cursor-pointer rounded-full border-none bg-surface-container-high px-6 py-4 text-on-surface transition-all focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary"
                    value={apartmentCondition}
                    onChange={(e) => setApartmentCondition(e.target.value)}
                  >
                    {APARTMENT_CONDITIONS.map((condition) => (
                      <option key={condition}>{condition}</option>
                    ))}
                  </select>
                  <span className="material-symbols-outlined pointer-events-none absolute right-5 top-1/2 -translate-y-1/2 text-outline">
                    expand_more
                  </span>
                </div>
              </div>
              <div className="space-y-2">
                <label className="ml-1 text-xs font-semibold uppercase tracking-widest text-on-surface-variant">
                  Mô tả lưu kèm ảnh
                </label>
                <textarea
                  className="w-full min-h-[6rem] resize-y rounded-2xl border-none bg-surface-container-high px-4 py-3 text-sm text-on-surface placeholder:text-outline-variant focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary"
                  placeholder="Mô tả đầy đủ (dự án, view, tình trạng…). Để trống sẽ dùng: Mã căn · Loại căn hộ."
                  value={listingDescription}
                  onChange={(e) => setListingDescription(e.target.value)}
                />
              </div>
            </div>
            <div className="flex items-start gap-4 rounded-xl border border-primary-container/50 bg-primary-container/30 p-6">
              <span className="material-symbols-outlined text-primary">info</span>
              <p className="text-sm leading-relaxed text-on-primary-container">
                Gemini có thể điền form từ ghi chú + ảnh đã chọn. Thêm <span className="font-mono text-xs">GEMINI_API_KEY</span> trong backend/.env (Google AI Studio, free tier).
              </p>
            </div>
          </section>

          <section className="flex flex-col space-y-8 lg:min-w-0">
            <div className="flex flex-col gap-2">
              <h2 className="text-3xl font-bold tracking-tight text-on-background">Visual Assets</h2>
              <p className="text-on-surface-variant">Drag high-resolution photography here to begin the gallery creation.</p>
            </div>

            <div className="group relative flex min-h-[20rem] flex-1 flex-col">
              <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={onSelectFiles} />
              <div
                onClick={() => inputRef.current?.click()}
                className="flex min-h-[20rem] w-full flex-1 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-outline-variant/30 bg-surface-container-low p-10 text-center transition-colors hover:bg-surface-container"
              >
                <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-white shadow-sm transition-transform duration-300 group-hover:scale-110">
                  <span className="material-symbols-outlined text-4xl text-primary">cloud_upload</span>
                </div>
                <h3 className="mb-2 text-xl font-bold">Drag &amp; Drop Assets</h3>
                <p className="mx-auto max-w-xs text-on-surface-variant">
                  Supports high-res JPEG, PNG, and TIFF formats. Minimum 2500px wide recommended.
                </p>
                <button
                  type="button"
                  className="mt-6 rounded-full border border-outline-variant/20 bg-white px-8 py-3 text-sm font-semibold transition-all hover:shadow-md"
                >
                  Browse Files
                </button>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold uppercase tracking-widest text-on-surface-variant">
                  Selected Images ({previewImages.length})
                </h4>
                <button onClick={clearFiles} className="text-sm font-semibold text-primary hover:underline">
                  Clear All
                </button>
              </div>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {previewImages.map((item) => (
                  <div key={item.name} className="group relative aspect-square overflow-hidden rounded-lg bg-surface-container">
                    <img alt={item.name} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110" src={item.image} />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        onClick={() => removeFile(item.name)}
                        className="rounded-full bg-white/20 p-2 text-white backdrop-blur-md transition-colors hover:bg-white/40"
                      >
                        <span className="material-symbols-outlined">delete</span>
                      </button>
                    </div>
                  </div>
                ))}
                {submitting ? (
                  <div className="relative flex aspect-square flex-col items-center justify-center rounded-lg border border-primary/20 bg-surface-container">
                    <div className="mb-2 h-1 w-12 overflow-hidden rounded-full bg-surface-container-high">
                      <div className="h-full w-2/3 bg-primary" />
                    </div>
                    <span className="text-[10px] font-bold uppercase text-primary">Uploading...</span>
                  </div>
                ) : null}
              </div>
              {submitError ? <p className="text-sm text-error">{submitError}</p> : null}
              {submitSuccess ? <p className="text-sm text-primary">{submitSuccess}</p> : null}
              {!canSubmit && !submitting ? (
                <p className="text-sm text-on-surface-variant">
                  Vui lòng nhập đủ thông tin bắt buộc và chọn ít nhất 1 ảnh để lưu.
                </p>
              ) : null}
            </div>
          </section>
        </div>
      </main>

      <footer className="sticky bottom-0 z-40 w-full border-t border-slate-100 bg-white/80 px-8 py-4 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-end gap-4">
          <button onClick={clearFiles} className="rounded-full px-8 py-3 text-sm font-semibold text-on-surface transition-all hover:bg-slate-100">
            Hủy
          </button>
          <button
            onClick={submitForm}
            disabled={!canSubmit}
            className="flex items-center gap-3 rounded-full bg-primary px-10 py-4 text-sm font-bold text-on-primary shadow-lg shadow-primary/20 transition-all hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span className="material-symbols-outlined text-lg">auto_awesome</span>
            {submitting ? "Đang lưu..." : "Lưu & Phân loại AI"}
          </button>
        </div>
      </footer>
    </>
  );
}

export default function App() {
  const [activePage, setActivePage] = useState("apartments");
  const [detailApartment, setDetailApartment] = useState(null);
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const pageTitle = useMemo(() => {
    if (detailApartment) return detailApartment.name;
    if (activePage === "uploads") return "Upload New Property";
    return "Managed Apartments";
  }, [detailApartment, activePage]);

  const apartments = useMemo(() => mapToApartments(images), [images]);

  const fetchImages = async () => {
    setLoading(true);
    setError("");
    try {
      const url = `${API_BASE_URL}/api/images`.replace(/([^:]\/)\/+/g, "$1");
      const response = await fetch(url);
      if (!response.ok) {
        const body = await response.text();
        throw new Error(
          `Không tải được dữ liệu (${response.status}). ` +
            `${body ? body.slice(0, 200) : "Kiểm tra backend đã chạy (npm run dev trong backend) và đúng cổng 5000."}`,
        );
      }
      const data = await response.json();
      setImages(Array.isArray(data) ? data : []);
    } catch (fetchError) {
      const msg =
        fetchError instanceof TypeError && fetchError.message === "Failed to fetch"
          ? "Không kết nối được backend. Chạy backend: cd backend && npm run dev — rồi restart frontend (npm run dev)."
          : fetchError.message;
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchImages();
  }, []);

  const openedApartmentFromQuery = useRef(false);
  useEffect(() => {
    if (openedApartmentFromQuery.current || apartments.length === 0) return;
    let code = null;
    try {
      code = new URLSearchParams(window.location.search).get("apartment");
    } catch {
      return;
    }
    if (!code) return;
    const match = apartments.find((a) => String(a.id) === code);
    if (match) {
      setActivePage("apartments");
      setDetailApartment(match);
      openedApartmentFromQuery.current = true;
    }
  }, [apartments]);

  return (
    <div className="bg-surface text-on-surface">
      <aside className="fixed left-0 top-0 z-40 flex h-screen w-64 flex-col bg-slate-50 py-8 pr-4">
        <div className="mb-10 px-8">
          <h2 className="text-xl font-extrabold tracking-tight text-cyan-900">Editorial Suites</h2>
          <p className="text-xs text-on-surface-variant opacity-70">Premium Management</p>
        </div>

        <nav className="flex-1 space-y-1">
          <button
            onClick={() => {
              setDetailApartment(null);
              setActivePage("apartments");
            }}
            className={`flex w-full items-center px-8 py-3 text-sm transition-transform duration-200 ${
              activePage === "apartments" && !detailApartment
                ? "translate-x-1 rounded-r-full bg-white font-semibold text-cyan-700 shadow-sm"
                : "font-medium text-slate-500 hover:translate-x-1 hover:text-cyan-600"
            }`}
          >
            <span className="material-symbols-outlined mr-3">domain</span>
            Apartments
          </button>
          <button
            onClick={() => {
              setDetailApartment(null);
              setActivePage("uploads");
            }}
            className={`flex w-full items-center px-8 py-3 text-sm transition-transform duration-200 ${
              activePage === "uploads"
                ? "translate-x-1 rounded-r-full bg-white font-semibold text-cyan-700 shadow-sm"
                : "font-medium text-slate-500 hover:translate-x-1 hover:text-cyan-600"
            }`}
          >
            <span className="material-symbols-outlined mr-3">cloud_upload</span>
            Uploads
          </button>
        </nav>

        <div className="mb-8 px-6">
          <button
            onClick={() => {
              setDetailApartment(null);
              setActivePage("uploads");
            }}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-medium text-on-primary shadow-lg shadow-primary/20 transition-transform duration-200 hover:scale-105"
          >
            <span className="material-symbols-outlined text-lg">add</span>
            Upload New Assets
          </button>
        </div>

        <div className="mt-auto border-t border-surface-container pt-6">
          <a className="flex items-center px-8 py-3 text-sm font-medium text-slate-500 hover:text-cyan-600" href="#">
            <span className="material-symbols-outlined mr-3">help</span>
            Help Center
          </a>
          <a className="flex items-center px-8 py-3 text-sm font-medium text-slate-500 hover:text-cyan-600" href="#">
            <span className="material-symbols-outlined mr-3">logout</span>
            Log Out
          </a>
        </div>
      </aside>

      {/* pl-64 thay cho ml-64 + width calc — tránh lệch/tràn ngang; nội dung nằm đúng vùng còn lại sau sidebar */}
      <div className="flex min-h-screen w-full min-w-0 flex-col pl-64">
        <header className="fixed left-64 right-0 top-0 z-50 flex items-center justify-between gap-4 bg-white/70 px-8 py-4 tracking-tight backdrop-blur-md">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-bold tracking-tight text-cyan-800">{pageTitle}</h1>
          </div>

          <div className="flex items-center gap-4">
            <button className="rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-100/50">
              <span className="material-symbols-outlined">notifications</span>
            </button>
            <button className="rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-100/50">
              <span className="material-symbols-outlined">settings</span>
            </button>
            <div className="ml-2 h-8 w-8 overflow-hidden rounded-full border border-surface-container-highest">
              <img
                className="h-full w-full object-cover"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuBzWHIzQ-hDsErBUMn3cgENsCJBvoJyJIwzubmvfe6oVXv6rLiikDdQJAEEe7Qp-MtsXrU52d8yfPdf9hgX9R6xLlh0sKSNjBtNcWK_WnrlVcqhfqiLJKzDH40pviKWLMgz79FL9H7TvNnycARldlCBwwo7DDJZYWdYL2E5rIsk9sfm90eIdhuYy5AUTSxAeH1LpSk6RguEMNhGk0hOeDA40M8_uWU01tcgQPE7kND88HqBNk63fuTNvZeNSaTLRqS7dk-_QmVLEfHD"
                alt="Profile"
              />
            </div>
          </div>
        </header>
        {detailApartment ? (
          <ApartmentDetailPage
            apartment={detailApartment}
            apiBaseUrl={API_BASE_URL}
            onBack={() => setDetailApartment(null)}
            onUploadMore={() => {
              setDetailApartment(null);
              setActivePage("uploads");
            }}
          />
        ) : activePage === "uploads" ? (
          <UploadPage onUploaded={fetchImages} />
        ) : (
          <ManagePage
            apartments={apartments}
            loading={loading}
            error={error}
            onRefresh={fetchImages}
            onOpenUpload={() => {
              setDetailApartment(null);
              setActivePage("uploads");
            }}
            onOpenGallery={(a) => setDetailApartment(a)}
            onUploadMoreFromCard={() => {
              setDetailApartment(null);
              setActivePage("uploads");
            }}
          />
        )}
      </div>
    </div>
  );
}
