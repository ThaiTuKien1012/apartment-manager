import { useMemo, useState } from "react";

const formatListDate = (value) => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("vi-VN", { day: "2-digit", month: "short", year: "numeric" });
};

const earliestPostedTimestamp = (imgs) => {
  let min = null;
  for (const img of imgs) {
    const t = new Date(img.createdAt || img.updatedAt || 0).getTime();
    if (Number.isNaN(t)) continue;
    min = min === null ? t : Math.min(min, t);
  }
  return min;
};

/**
 * Chia sẻ link gallery tới Zalo (và app khác).
 * Trang `button-share.zalo.me` thường báo lỗi DNS (NXDOMAIN) ngoài VN hoặc trên mạng chặn — không dùng làm bước chính.
 * - Mobile hỗ trợ Web Share: mở sheet hệ thống → chọn Zalo.
 * - Còn lại: copy link + hướng dẫn dán vào Zalo.
 */
async function shareLinkForZalo(pageUrl, title) {
  const shareTitle = title || "Gallery căn hộ";

  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({
        title: shareTitle,
        text: `${shareTitle}\n${pageUrl}`,
        url: pageUrl,
      });
      return;
    } catch (err) {
      if (err && err.name === "AbortError") return;
    }
  }

  try {
    await navigator.clipboard.writeText(pageUrl);
    window.alert(
      "Đã copy link gallery.\n\nMở Zalo → chọn cuộc trò chuyện → dán link và gửi.\n\n(Nếu trang chia sẻ Zalo không mở được: dùng cách copy này.)",
    );
  } catch {
    window.prompt("Sao chép link (Ctrl/Cmd+C), rồi dán vào Zalo:", pageUrl);
  }
}

function resolveImageUrl(url, apiBaseUrl) {
  if (!url) return "";
  if (url.startsWith("http")) return url;
  const normalized = String(url).replace(/\\/g, "/");
  const uploadsIndex = normalized.indexOf("uploads/");
  const relative = uploadsIndex >= 0 ? normalized.slice(uploadsIndex) : normalized;
  const base = String(apiBaseUrl || "").replace(/\/$/, "");
  const prefix = base ? `${base}/` : "/";
  return `${prefix}${relative}`.replace(/([^:]\/)\/+/g, "$1");
}

export default function ApartmentDetailPage({ apartment, apiBaseUrl, onBack, onUploadMore }) {
  const items = apartment.items || [];
  const [filter, setFilter] = useState("all");
  const [selectedImage, setSelectedImage] = useState("");

  const meta = items[0] || {};
  const tagBuckets = useMemo(() => {
    const map = new Map();
    items.forEach((img) => {
      const tag = (img.tags && img.tags[0]) || (img.description ? String(img.description).slice(0, 24) : "Ảnh");
      const key = tag || "Khác";
      map.set(key, (map.get(key) || 0) + 1);
    });
    return Array.from(map.entries());
  }, [items]);

  const filteredItems =
    filter === "all"
      ? items
      : items.filter((img) => {
          const tag = (img.tags && img.tags[0]) || (img.description ? String(img.description).slice(0, 24) : "Ảnh");
          return tag === filter;
        });

  const titleLine = apartment.name || meta.apartmentCode || "Căn hộ";
  const subtitle =
    meta.apartmentType && meta.apartmentCondition
      ? `${meta.apartmentType} · ${meta.apartmentCondition}`
      : meta.apartmentType || "";

  const postedDateLabel = useMemo(() => {
    const ts = earliestPostedTimestamp(items);
    return ts != null ? formatListDate(ts) : "—";
  }, [items]);

  return (
    <main className="mx-auto mt-20 w-full max-w-7xl px-8 pb-12 pt-2">
      <nav className="mb-4 flex items-center gap-2 text-sm text-on-surface-variant">
        <button type="button" onClick={onBack} className="hover:text-primary">
          Apartments
        </button>
        <span className="material-symbols-outlined text-xs">chevron_right</span>
        <span className="font-medium text-on-surface">{titleLine}</span>
      </nav>

      <div className="mb-10 flex flex-col justify-between gap-6 md:flex-row md:items-end">
        <div>
          <h1 className="mb-2 text-4xl font-extrabold tracking-tight text-on-surface">{titleLine}</h1>
          {subtitle ? (
            <div className="flex items-center gap-2 text-on-surface-variant">
              <span className="material-symbols-outlined text-sm">layers</span>
              <span className="text-sm">{subtitle}</span>
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => {
              const listingUrl = `${window.location.origin}${window.location.pathname}?apartment=${encodeURIComponent(String(apartment.id))}`;
              void shareLinkForZalo(listingUrl, titleLine);
            }}
            className="flex items-center gap-2 rounded-full border border-[#0068FF]/40 bg-[#0068FF]/5 px-5 py-2.5 text-[#0068FF] transition-all hover:bg-[#0068FF]/10"
            title="Điện thoại: menu chia sẻ → chọn Zalo. Máy tính: copy link và dán vào Zalo."
          >
            <span className="material-symbols-outlined text-sm">chat</span>
            <span className="text-sm font-medium">Chia sẻ Zalo</span>
          </button>
          <button
            type="button"
            className="flex items-center gap-2 rounded-full border border-outline-variant px-5 py-2.5 text-on-surface transition-all hover:bg-surface-container"
          >
            <span className="material-symbols-outlined text-sm">edit</span>
            <span className="text-sm font-medium">Edit Info</span>
          </button>
          <button
            type="button"
            onClick={onUploadMore}
            className="flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 text-on-primary shadow-sm transition-all hover:opacity-90"
          >
            <span className="material-symbols-outlined text-sm">cloud_upload</span>
            <span className="text-sm font-medium">Upload More</span>
          </button>
        </div>
      </div>

      <div className="mb-10 flex flex-wrap items-center justify-between rounded-lg bg-surface-container-low p-1">
        <div className="flex flex-1 items-center justify-center border-r border-outline-variant/20 py-4">
          <div className="text-center">
            <p className="text-2xl font-bold text-primary">{items.length}</p>
            <p className="text-xs font-medium uppercase tracking-widest text-on-surface-variant">Total Photos</p>
          </div>
        </div>
        <div className="flex flex-1 items-center justify-center border-r border-outline-variant/20 py-4">
          <div className="text-center">
            <p className="text-2xl font-bold text-on-surface">{meta.price || "—"}</p>
            <p className="text-xs font-medium uppercase tracking-widest text-on-surface-variant">Giá niêm yết</p>
          </div>
        </div>
        <div className="flex flex-1 items-center justify-center py-4">
          <div className="text-center">
            <p className="text-2xl font-bold text-on-surface">{apartment.updated}</p>
            <p className="text-xs font-medium uppercase tracking-widest text-on-surface-variant">Last Updated</p>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-10 lg:flex-row">
        <div className="min-w-0 flex-1">
          <div className="mb-8 flex items-center gap-2 overflow-x-auto pb-2">
            <button
              type="button"
              onClick={() => setFilter("all")}
              className={`whitespace-nowrap rounded-full px-6 py-2 text-sm font-medium ${
                filter === "all" ? "bg-primary text-on-primary" : "bg-surface-container text-on-surface-variant hover:text-primary"
              }`}
            >
              All ({items.length})
            </button>
            {tagBuckets.map(([label, count]) => (
              <button
                key={label}
                type="button"
                onClick={() => setFilter(label)}
                className={`whitespace-nowrap rounded-full px-6 py-2 text-sm font-medium ${
                  filter === label ? "bg-primary text-on-primary" : "bg-surface-container text-on-surface-variant hover:text-primary"
                }`}
              >
                {label} ({count})
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-8 md:grid-cols-2 xl:grid-cols-3">
            {filteredItems.map((img) => {
              const src = resolveImageUrl(img.url, apiBaseUrl);
              return (
                <div key={String(img._id)} className="flex flex-col">
                  <button
                    type="button"
                    onClick={() => setSelectedImage(src)}
                    className="group relative overflow-hidden rounded-xl bg-surface-container-lowest shadow-sm transition-all duration-300 hover:scale-[1.02] hover:shadow-xl"
                  >
                    <div className="relative aspect-[4/5]">
                      <img src={src} alt="Apartment" className="h-full w-full object-cover" />
                    </div>
                  </button>
                  <p className="mt-2 text-center text-xs text-on-surface-variant">{formatListDate(img.createdAt || img.updatedAt)}</p>
                </div>
              );
            })}
          </div>
        </div>

        <aside className="w-full shrink-0 lg:w-80">
          <div className="rounded-lg border border-outline-variant/10 bg-surface-container-lowest p-6 shadow-sm">
            <h4 className="mb-4 text-xs font-bold uppercase tracking-widest text-on-surface-variant">Property Data</h4>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-on-surface-variant">Mã căn hộ</span>
                <span className="font-medium text-on-surface">{meta.apartmentCode || "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-on-surface-variant">Tên sales</span>
                <span className="font-medium text-on-surface">{meta.saleName || "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-on-surface-variant">Loại căn</span>
                <span className="font-medium text-on-surface">{meta.apartmentCondition || "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-on-surface-variant">Giá</span>
                <span className="font-medium text-on-surface">{meta.price || "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-on-surface-variant">Ngày đăng</span>
                <span className="font-medium text-on-surface">{postedDateLabel}</span>
              </div>
            </div>
          </div>
        </aside>
      </div>

      {selectedImage ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4"
          onClick={() => setSelectedImage("")}
        >
          <button
            type="button"
            className="absolute right-6 top-6 rounded-full bg-white/20 p-2 text-white backdrop-blur-md hover:bg-white/40"
            onClick={() => setSelectedImage("")}
          >
            <span className="material-symbols-outlined">close</span>
          </button>
          <img
            src={selectedImage}
            alt="Preview"
            className="max-h-[92vh] w-auto max-w-[92vw] rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      ) : null}
    </main>
  );
}
