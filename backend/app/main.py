from fastapi import FastAPI, HTTPException, File, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
from app.models import create_tables
from app.routers import upload, coach, user, transcription
from app.services.storage import storage_service
import os
import io
from dotenv import load_dotenv
from azure.storage.blob import BlobServiceClient, generate_blob_sas, BlobSasPermissions
from datetime import datetime, timedelta

load_dotenv()

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await create_tables()
    yield
    # Shutdown - cleanup if needed

app = FastAPI(
    title="Golf Swing Coaching API",
    description="API for managing golf swing video coaching feedback",
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # Next.js default port
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

# Include routers
app.include_router(upload.router, prefix="/api/v1", tags=["upload"])
app.include_router(coach.router, prefix="/api/v1", tags=["coach"])
app.include_router(user.router, prefix="/api/v1", tags=["user"])
app.include_router(transcription.router, prefix="/api/v1", tags=["transcription"])

@app.get("/")
async def root():
    return {"message": "Golf Swing Coaching API is running"}

@app.get("/health")
async def health_check():
    return {"status": "healthy"}

# 動作確認済みのシンプルなSAS URL生成エンドポイント
@app.get("/media-url")
def get_media_url(blob_url: str):
    """
    Azure Blob StorageのファイルからSAS URLを生成（動作確認済み）
    """
    try:
        # blob_urlからファイル名を抽出
        if blob_url.startswith('https://'):
            # https://account.blob.core.windows.net/container/filename 形式
            parts = blob_url.split('/')
            filename = '/'.join(parts[4:])  # container以降の部分
        else:
            filename = blob_url
        
        # Azure設定を取得
        connection_string = os.getenv("AZURE_STORAGE_CONNECTION_STRING")
        container_name = os.getenv("AZURE_STORAGE_CONTAINER", "bbc-test")
        
        if not connection_string:
            raise HTTPException(status_code=500, detail="Azure接続設定が見つかりません")
        
        # Blob Service Client作成
        blob_service_client = BlobServiceClient.from_connection_string(connection_string)
        account_key = blob_service_client.credential.account_key
        account_name = blob_service_client.account_name
        
        # SAS トークン生成（15分間有効）
        sas_token = generate_blob_sas(
            account_name=account_name,
            container_name=container_name,
            blob_name=filename,
            account_key=account_key,
            permission=BlobSasPermissions(read=True),
            expiry=datetime.utcnow() + timedelta(minutes=15),
        )
        
        # SAS付きURLを生成
        blob_url = f"https://{account_name}.blob.core.windows.net/{container_name}/{filename}?{sas_token}"
        
        return {"url": blob_url}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/proxy-file/{file_path:path}")
async def proxy_file(file_path: str):
    """
    Azure Blob Storageファイルのプロキシエンドポイント
    """
    try:
        from fastapi.responses import Response
        import urllib.parse
        import aiohttp
        
        # URLデコード
        decoded_file_path = urllib.parse.unquote(file_path)
        
        # SAS URLを取得
        media_response = get_media_url(decoded_file_path)
        sas_url = media_response["url"]
        
        # ファイルをダウンロードしてプロキシ
        async with aiohttp.ClientSession() as session:
            async with session.get(sas_url) as response:
                if response.status != 200:
                    raise HTTPException(status_code=response.status, detail="ファイルの取得に失敗しました")
                
                content = await response.read()
                content_type = response.headers.get('content-type', 'application/octet-stream')
                
                return Response(
                    content=content,
                    media_type=content_type,
                    headers={
                        "Cache-Control": "no-cache, no-store, must-revalidate",
                        "Pragma": "no-cache",
                        "Expires": "0"
                    }
                )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"ファイルプロキシエラー: {str(e)}")

@app.post("/upload-section-image")
async def upload_section_image(image_file: UploadFile = File(...)):
    """
    セクション切り出し画像をAzure Blob Storageにアップロード
    """
    try:
        # ファイル形式チェック
        if not image_file.content_type or not image_file.content_type.startswith('image/'):
            raise HTTPException(status_code=400, detail="画像ファイルのみアップロード可能です")
        
        # ファイル内容を読み込み
        file_content = await image_file.read()
        file_stream = io.BytesIO(file_content)
        
        # Azure Blob Storageにアップロード
        image_url = await storage_service.upload_image(file_stream, image_file.filename or "section_image.jpg")
        
        return {
            "success": True,
            "image_url": image_url,
            "message": "画像のアップロードが完了しました"
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"画像アップロードに失敗しました: {str(e)}")

@app.post("/upload-markup-image")
async def upload_markup_image(
    image_data: str = Form(...),
    filename: str = Form(...),
    original_url: str = Form(...)
):
    """
    マークアップ画像（Base64）をAzure Blob Storageにアップロード
    """
    try:
        import base64
        
        # Base64データからバイナリデータを抽出
        if image_data.startswith('data:image/'):
            # data:image/jpeg;base64,/9j/4AAQ... の形式から base64 部分を抽出
            header, base64_data = image_data.split(',', 1)
        else:
            base64_data = image_data
        
        # Base64デコード
        try:
            file_content = base64.b64decode(base64_data)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Base64デコードに失敗しました: {str(e)}")
        
        file_stream = io.BytesIO(file_content)
        
        # Azure Blob Storageにアップロード
        image_url = await storage_service.upload_image(file_stream, filename)
        
        return {
            "success": True,
            "image_url": image_url,
            "message": "マークアップ画像のアップロードが完了しました",
            "original_url": original_url
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"マークアップ画像アップロードに失敗しました: {str(e)}")