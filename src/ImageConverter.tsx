import React, { useState, type DragEvent } from "react";
import JSZip from "jszip";

type ConvertedImage = {
  name: string;
  originalUrl: string;
  webpUrl: string;
  webpBlob: Blob;
};

const ImageConverter: React.FC = () => {
  const [images, setImages] = useState<ConvertedImage[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(false);
  const [quality, setQuality] = useState(0.8); // 👈 user-controlled quality (0.1–1.0)

  // Convert a single File -> WebP (respecting quality, full resolution)
  const convertFileToWebP = (file: File): Promise<ConvertedImage> => {
    return new Promise((resolve, reject) => {
      // preview for "original"
      const originalUrl = URL.createObjectURL(file);

      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const img = new Image();
        img.onload = async () => {
          try {
            const canvas = document.createElement("canvas");
            const ctx = canvas.getContext("2d");
            if (!ctx) return reject(new Error("Canvas not supported"));

            // Use full native resolution to avoid downscale blur
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

            // Convert with selected quality
            const webpBlob: Blob = await new Promise((res, rej) =>
              canvas.toBlob(
                (b) => (b ? res(b) : rej(new Error("toBlob failed"))),
                "image/webp",
                quality
              )
            );

            const webpUrl = URL.createObjectURL(webpBlob);

            resolve({
              name: file.name,
              originalUrl,
              webpUrl,
              webpBlob,
            });
          } catch (e) {
            reject(e);
          }
        };
        img.onerror = () => reject(new Error("Image load failed"));
        img.src = reader.result as string;
      };
      reader.onerror = () => reject(new Error("File read error"));
    });
  };

  // Handle file selection (bulk) with progress UI
  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files).filter((f) =>
      f.type.startsWith("image/")
    );
    if (fileArray.length === 0) return;

    setLoading(true);
    setProgress(0);

    const converted: ConvertedImage[] = [];
    for (let i = 0; i < fileArray.length; i++) {
      try {
        const conv = await convertFileToWebP(fileArray[i]);
        converted.push(conv);
      } catch (err) {
        console.error("Failed to convert:", fileArray[i].name, err);
      }
      setProgress(Math.round(((i + 1) / fileArray.length) * 100));
    }

    setImages((prev) => [...prev, ...converted]);
    setLoading(false);
    // leave progress at 100 briefly, then hide
    setTimeout(() => setProgress(0), 800);
  };

  // Drag & drop events
  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(true);
  };
  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(false);
  };
  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(false);
    handleFiles(e.dataTransfer.files);
  };

  const clearAll = () => {
    // Revoke object URLs to avoid memory leaks
    images.forEach((img) => {
      URL.revokeObjectURL(img.originalUrl);
      URL.revokeObjectURL(img.webpUrl);
    });
    setImages([]);
    setProgress(0);
    setLoading(false);
  };

  // ZIP all converted WebPs (traditional <a> download)
  const downloadAllAsZip = async () => {
    if (images.length === 0) return;

    const zip = new JSZip();
    const folder = zip.folder("webp-images");
    if (!folder) return;

    images.forEach((img) => {
      const base = img.name.replace(/\.[^/.]+$/, "");
      folder.file(`${base}.webp`, img.webpBlob);
    });

    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "converted-webp-images.zip";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 p-6">
      <div className="bg-white shadow-lg rounded-2xl p-6 w-full max-w-3xl text-center">
        <h1 className="text-2xl font-bold mb-4 text-gray-800">
          Bulk Image → WebP Converter
        </h1>

        {/* Quality control */}
        <div className="mb-6 text-left">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Quality:{" "}
            <span className="font-semibold">{Math.round(quality * 100)}%</span>
          </label>
          <input
            type="range"
            min={0.1}
            max={1}
            step={0.05}
            value={quality}
            onChange={(e) => setQuality(parseFloat(e.target.value))}
            className="w-full accent-indigo-600"
          />
          <p className="text-xs text-gray-500 mt-1">
            Tip: 0.7–0.85 is a good balance. 1.0 = max quality (larger size).
          </p>
        </div>

        {/* Upload Area */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-xl p-10 cursor-pointer mb-6 transition
              ${
                dragActive
                  ? "border-indigo-600 bg-indigo-50"
                  : "border-gray-300 bg-gray-50"
              }
            `}
        >
          <input
            type="file"
            multiple
            accept="image/*"
            onChange={(e) => handleFiles(e.target.files)}
            className="hidden"
            id="fileUpload"
          />
          <label htmlFor="fileUpload" className="cursor-pointer">
            <p className="text-gray-600">
              Drag & drop images here or{" "}
              <span className="text-indigo-600 font-medium">Browse</span>
            </p>
            <p className="text-xs text-gray-400 mt-1">
              (Bulk selection supported)
            </p>
          </label>
        </div>

        {/* Progress */}
        {loading && (
          <div className="w-full mb-6">
            <div className="w-full bg-gray-200 rounded-full h-4">
              <div
                className="bg-indigo-600 h-4 rounded-full transition-all duration-200"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="mt-2 text-sm text-gray-700 font-medium">
              Converting… {progress}%
            </p>
          </div>
        )}

        {/* Actions */}
        {images.length > 0 && !loading && (
          <div className="flex justify-center gap-4 mb-6">
            <button
              onClick={clearAll}
              className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg shadow-md transition"
            >
              Clear All
            </button>
            <button
              onClick={downloadAllAsZip}
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg shadow-md transition"
            >
              Download All (ZIP)
            </button>
          </div>
        )}

        {/* Converted Previews */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {images.map((img, idx) => (
            <div
              key={`${img.name}-${idx}`}
              className="p-4 bg-gray-50 rounded-xl shadow flex flex-col items-center"
            >
              <h2 className="text-sm font-medium text-gray-700 mb-2 truncate w-full text-center">
                {img.name}
              </h2>

              <div className="mb-3">
                <img
                  src={img.originalUrl}
                  alt="Original"
                  className="rounded-lg max-h-40 mx-auto"
                />
                <p className="text-xs text-gray-500 mt-1">Original</p>
              </div>

              <div className="mb-3">
                <img
                  src={img.webpUrl}
                  alt="WebP"
                  className="rounded-lg max-h-40 mx-auto"
                />
                <p className="text-xs text-gray-500 mt-1">
                  WebP ({Math.round(quality * 100)}%)
                </p>
              </div>

              <a
                href={img.webpUrl}
                download={`${img.name.replace(/\.[^/.]+$/, "")}.webp`}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1 rounded-lg shadow-md text-sm"
              >
                Download WebP
              </a>
            </div>
          ))}
        </div>

        {/* Empty state */}
        {images.length === 0 && !loading && (
          <p className="text-gray-500 mt-6">No images converted yet.</p>
        )}
      </div>
    </div>
  );
};

export default ImageConverter;
