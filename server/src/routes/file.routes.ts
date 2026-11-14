import { Router, type NextFunction, type Response } from "express";
import multer from "multer";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { prisma } from "../config/prisma.js";
import {
  authenticate,
  type AuthenticatedRequest,
} from "../middleware/auth.middleware.js";

// Mounted by meeting.routes.ts at /api/meetings/:meetingId/files
const router = Router({ mergeParams: true });

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_NAME_LENGTH = 150;

// Allowed extensions and the content types a browser may send for each.
// Executables, scripts and SVG (which can contain scripts) are not on the list.
const ALLOWED_TYPES: Record<string, string[]> = {
  ".jpg": ["image/jpeg"],
  ".jpeg": ["image/jpeg"],
  ".png": ["image/png"],
  ".gif": ["image/gif"],
  ".webp": ["image/webp"],
  ".pdf": ["application/pdf"],
  ".txt": ["text/plain"],
  ".csv": ["text/csv", "application/vnd.ms-excel"],
  ".doc": ["application/msword"],
  ".docx": [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
  ".xls": ["application/vnd.ms-excel"],
  ".xlsx": [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ],
  ".ppt": ["application/vnd.ms-powerpoint"],
  ".pptx": [
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ],
  ".zip": ["application/zip", "application/x-zip-compressed"],
};

// Files are kept in server/uploads (relative to where the server is started).
const UPLOAD_DIR = path.resolve(process.cwd(), "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

class UploadRejectedError extends Error {}

function paramOf(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return String(value[0] ?? "").trim();
  return "";
}

// Browsers send file names as UTF-8, but the upload parser reads them as
// latin1, which garbles non-English names. This undoes that, then cleans the
// name so it is safe to show and to use in a download header.
function cleanFileName(rawName: string): string {
  const decoded = Buffer.from(rawName, "latin1").toString("utf8");

  const cleaned = decoded
    .replace(/[\\/]/g, "_")
    .replace(/[\u0000-\u001f\u007f"]/g, "")
    .trim();

  const base = cleaned || "file";

  if (base.length <= MAX_NAME_LENGTH) return base;

  const ext = path.extname(base).slice(0, 12);
  return base.slice(0, MAX_NAME_LENGTH - ext.length) + ext;
}

async function removeStoredFile(storedName: string) {
  try {
    await fs.promises.unlink(path.join(UPLOAD_DIR, storedName));
  } catch {
    // Already gone, nothing more to do.
  }
}

// Stops the request before anything happens if the meeting does not exist.
async function requireMeeting(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    const meetingId = paramOf(req.params["meetingId"]);

    if (!meetingId) {
      return res.status(400).json({
        success: false,
        message: "A meeting ID is required",
      });
    }

    const meeting = await prisma.orm.public.Meeting.first({
      id: meetingId,
    });

    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: "Meeting not found",
      });
    }

    return next();
  } catch (error) {
    console.error("Meeting lookup failed:", error);

    return res.status(500).json({
      success: false,
      message: "Could not check the meeting",
    });
  }
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    // A random name, so what the uploader typed never decides where it is saved.
    filename: (_req, _file, cb) => cb(null, randomUUID()),
  }),
  limits: { fileSize: MAX_FILE_SIZE, files: 1 },
  fileFilter: (_req, file, cb) => {
    const name = cleanFileName(file.originalname);
    const extension = path.extname(name).toLowerCase();
    const allowedMimeTypes = ALLOWED_TYPES[extension];

    if (!allowedMimeTypes) {
      return cb(
        new UploadRejectedError("This file type is not allowed."),
      );
    }

    if (!allowedMimeTypes.includes(file.mimetype)) {
      return cb(
        new UploadRejectedError(
          "The file's type does not match its extension.",
        ),
      );
    }

    return cb(null, true);
  },
});

// GET /api/meetings/:meetingId/files
// Lists the files shared in this meeting, oldest first.
router.get(
  "/",
  authenticate,
  requireMeeting,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const meetingId = paramOf(req.params["meetingId"]);

      const records = await prisma.orm.public.File.all();

      const files = records
        .filter((record) => String(record.meetingId) === meetingId)
        .sort(
          (a, b) =>
            new Date(String(a.createdAt)).getTime() -
            new Date(String(b.createdAt)).getTime(),
        )
        .map((record) => ({
          id: record.id,
          meetingId: record.meetingId,
          uploaderId: record.uploaderId,
          originalName: record.originalName,
          mimeType: record.mimeType,
          size: record.size,
          createdAt: record.createdAt,
        }));

      return res.json({ success: true, files });
    } catch (error) {
      console.error("Listing files failed:", error);

      return res.status(500).json({
        success: false,
        message: "Could not load the files",
      });
    }
  },
);

// GET /api/meetings/:meetingId/files/:fileId
// Sends the file as a download, under the name the uploader gave it.
router.get(
  "/:fileId",
  authenticate,
  requireMeeting,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const meetingId = paramOf(req.params["meetingId"]);
      const fileId = paramOf(req.params["fileId"]);

      if (!fileId) {
        return res.status(400).json({
          success: false,
          message: "A file ID is required",
        });
      }

      const record = await prisma.orm.public.File.first({ id: fileId });

      // A file from another meeting is reported as missing, not forbidden,
      // so it does not confirm that the file exists.
      if (!record || String(record.meetingId) !== meetingId) {
        return res.status(404).json({
          success: false,
          message: "File not found",
        });
      }

      const fullPath = path.resolve(UPLOAD_DIR, String(record.storedName));

      // The stored name is a random ID we created, but check anyway so a
      // damaged database row can never point outside the uploads folder.
      if (!fullPath.startsWith(UPLOAD_DIR + path.sep)) {
        return res.status(404).json({
          success: false,
          message: "File not found",
        });
      }

      res.setHeader("X-Content-Type-Options", "nosniff");

      return res.download(fullPath, String(record.originalName), (error) => {
        if (error && !res.headersSent) {
          res.status(404).json({
            success: false,
            message: "The file is no longer available",
          });
        }
      });
    } catch (error) {
      console.error("Download failed:", error);

      return res.status(500).json({
        success: false,
        message: "Could not download the file",
      });
    }
  },
);

// POST /api/meetings/:meetingId/files   (form field name: "file")
router.post("/", authenticate, requireMeeting, (req: AuthenticatedRequest, res: Response) => {
  upload.single("file")(req, res, async (uploadError: unknown) => {
    if (uploadError) {
      if (uploadError instanceof multer.MulterError) {
        if (uploadError.code === "LIMIT_FILE_SIZE") {
          return res.status(413).json({
            success: false,
            message: "File is too large. The limit is 10 MB.",
          });
        }

        return res.status(400).json({
          success: false,
          message: 'Send exactly one file in the "file" field.',
        });
      }

      if (uploadError instanceof UploadRejectedError) {
        return res.status(400).json({
          success: false,
          message: uploadError.message,
        });
      }

      console.error("Upload failed:", uploadError);

      return res.status(500).json({
        success: false,
        message: "Upload failed",
      });
    }

    const file = req.file;

    if (!file) {
      return res.status(400).json({
        success: false,
        message: "No file was uploaded",
      });
    }

    const userId = req.user?.userId;

    if (!userId) {
      await removeStoredFile(file.filename);

      return res.status(401).json({
        success: false,
        message: "Authorization token is required",
      });
    }

    if (file.size === 0) {
      await removeStoredFile(file.filename);

      return res.status(400).json({
        success: false,
        message: "The file is empty",
      });
    }

    try {
      const record = await prisma.orm.public.File.create({
        meetingId: paramOf(req.params["meetingId"]),
        uploaderId: userId,
        originalName: cleanFileName(file.originalname),
        storedName: file.filename,
        mimeType: file.mimetype,
        size: file.size,
      });

      // The stored name stays on the server and is never sent to the browser.
      return res.status(201).json({
        success: true,
        message: "File uploaded",
        file: {
          id: record.id,
          meetingId: record.meetingId,
          uploaderId: record.uploaderId,
          originalName: record.originalName,
          mimeType: record.mimeType,
          size: record.size,
          createdAt: record.createdAt,
        },
      });
    } catch (error) {
      console.error("Saving file record failed:", error);
      await removeStoredFile(file.filename);

      return res.status(500).json({
        success: false,
        message: "Could not save the file",
      });
    }
  });
});

export default router;