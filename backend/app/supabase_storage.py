import httpx
import os
import uuid
from pathlib import Path
from .config import settings

def upload_screenshot(file_bytes: bytes, filename: str) -> str:
    """
    Uploads a screenshot image (bytes) to Supabase Storage.
    If Supabase credentials are not configured, falls back to local storage in static/uploads.
    Returns the public URL (either from Supabase or local FastAPI server).
    """
    supabase_url = settings.SUPABASE_URL
    supabase_key = settings.SUPABASE_KEY
    bucket_name = settings.SUPABASE_STORAGE_BUCKET

    # Clean filename to prevent collisions and illegal characters
    file_ext = Path(filename).suffix or ".png"
    unique_filename = f"{uuid.uuid4()}{file_ext}"

    if supabase_url and supabase_key:
        try:
            # Strip trailing slash if present
            base_url = supabase_url.rstrip("/")
            upload_url = f"{base_url}/storage/v1/object/{bucket_name}/{unique_filename}"
            
            headers = {
                "Authorization": f"Bearer {supabase_key}",
                "apikey": supabase_key,
                "Content-Type": "image/png"  # force image/png or read from file type
            }
            
            with httpx.Client() as client:
                res = client.post(upload_url, headers=headers, content=file_bytes)
                if res.status_code == 200:
                    # Return public URL: {supabase_url}/storage/v1/object/public/{bucket}/{filename}
                    return f"{base_url}/storage/v1/object/public/{bucket_name}/{unique_filename}"
                else:
                    print(f"⚠️ Supabase upload failed with status {res.status_code}: {res.text}")
        except Exception as e:
            print(f"⚠️ Error uploading to Supabase Storage: {str(e)}")

    # ── Local File System Fallback ──
    try:
        static_dir = Path("static/uploads")
        static_dir.mkdir(parents=True, exist_ok=True)
        filepath = static_dir / unique_filename
        
        with open(filepath, "wb") as f:
            f.write(file_bytes)
            
        # Strip trailing slash from FRONTEND_URL to format local link
        # Render/local port swap logic: replace port 5173 with 8000
        backend_base = settings.FRONTEND_URL.replace(":5173", ":8000")
        backend_base = backend_base.rstrip("/")
        return f"{backend_base}/static/uploads/{unique_filename}"
    except Exception as local_err:
        print(f"⚠️ Local save failed: {str(local_err)}")
        raise local_err
