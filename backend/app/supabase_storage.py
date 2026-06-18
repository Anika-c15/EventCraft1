import httpx
import os
import uuid
import mimetypes
from pathlib import Path
from .config import settings

def upload_screenshot(file_bytes: bytes, filename: str, request_base_url: str = None) -> str:
    """
    Uploads a screenshot image (bytes) to Supabase Storage.
    If Supabase credentials are not configured, falls back to local storage in static/uploads.
    Returns the public URL (either from Supabase or local FastAPI server).
    """
    supabase_url = settings.SUPABASE_URL
    supabase_key = settings.SUPABASE_KEY
    bucket_name = settings.SUPABASE_STORAGE_BUCKET or "social-screenshots"

    # Clean filename to prevent collisions and illegal characters
    file_ext = Path(filename).suffix or ".png"
    unique_filename = f"{uuid.uuid4()}{file_ext}"

    # Determine MIME type dynamically
    mime_type, _ = mimetypes.guess_type(filename)
    if not mime_type:
        mime_type = "image/png" if file_ext.lower() == ".png" else "image/jpeg"

    if supabase_url and supabase_key:
        try:
            base_url = supabase_url.rstrip("/")
            upload_url = f"{base_url}/storage/v1/object/{bucket_name}/{unique_filename}"
            
            headers = {
                "Authorization": f"Bearer {supabase_key}",
                "apikey": supabase_key,
                "Content-Type": mime_type
            }
            
            with httpx.Client() as client:
                # 1. Attempt to upload the file
                res = client.post(upload_url, headers=headers, content=file_bytes)
                
                # 2. If bucket doesn't exist (commonly 400 or 404), try creating it and retry upload
                if res.status_code != 200:
                    print(f"⚠️ Supabase upload first attempt failed (status {res.status_code}): {res.text}. Attempting to create public bucket '{bucket_name}'...")
                    
                    bucket_headers = {
                        "Authorization": f"Bearer {supabase_key}",
                        "apikey": supabase_key,
                        "Content-Type": "application/json"
                    }
                    bucket_payload = {
                        "id": bucket_name,
                        "name": bucket_name,
                        "public": True  # Crucial: Must be a public bucket for public URLs to work
                    }
                    bucket_url = f"{base_url}/storage/v1/bucket"
                    bucket_res = client.post(bucket_url, headers=bucket_headers, json=bucket_payload)
                    
                    if bucket_res.status_code in [200, 201]:
                        print(f"✅ Public bucket '{bucket_name}' created successfully. Retrying upload...")
                        res = client.post(upload_url, headers=headers, content=file_bytes)
                    else:
                        print(f"⚠️ Failed to create bucket '{bucket_name}' (status {bucket_res.status_code}): {bucket_res.text}")
                
                if res.status_code == 200:
                    # Return public URL: {supabase_url}/storage/v1/object/public/{bucket}/{filename}
                    public_url = f"{base_url}/storage/v1/object/public/{bucket_name}/{unique_filename}"
                    print(f"✅ Supabase upload successful: {public_url}")
                    return public_url
                else:
                    print(f"⚠️ Supabase upload failed with status {res.status_code}: {res.text}")
        except Exception as e:
            print(f"⚠️ Error uploading to Supabase Storage: {str(e)}")

    # ── Local File System Fallback ──
    print("ℹ️ Falling back to local file storage...")
    try:
        static_dir = Path("static/uploads")
        static_dir.mkdir(parents=True, exist_ok=True)
        filepath = static_dir / unique_filename
        
        with open(filepath, "wb") as f:
            f.write(file_bytes)
            
        if request_base_url:
            backend_base = request_base_url.rstrip("/")
        else:
            # Strip trailing slash from FRONTEND_URL to format local link
            # Render/local port swap logic: replace port 5173 with 8000
            backend_base = settings.FRONTEND_URL.replace(":5173", ":8000")
            backend_base = backend_base.rstrip("/")
        
        local_url = f"{backend_base}/static/uploads/{unique_filename}"
        print(f"ℹ️ Local save successful: {local_url}")
        return local_url
    except Exception as local_err:
        print(f"⚠️ Local save failed: {str(local_err)}")
        raise local_err

