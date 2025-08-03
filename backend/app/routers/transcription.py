from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from typing import Optional
import os
import tempfile
from openai import OpenAI
from dotenv import load_dotenv
from app.utils.logger import logger
from app.services.storage import storage_service
import io
from datetime import datetime

load_dotenv()

def generate_audio_filename(type: str, video_filename: Optional[str] = None, phase_code: Optional[str] = None) -> str:
    """
    音声ファイル名を生成する
    
    - **type**: 音声の種類 (advice, practice, phase_advice)
    - **video_filename**: 動画ファイル名
    - **phase_code**: スイング段階コード
    """
    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
    
    if type == "phase_advice" and phase_code:
        return f"{timestamp}_{phase_code}_audio.wav"
    elif type == "advice":
        return f"{timestamp}_advice_audio.wav"
    elif type == "practice":
        return f"{timestamp}_practice_audio.wav"
    else:
        return f"{timestamp}_general_audio.wav"

router = APIRouter()

# OpenAI クライアント初期化
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

@router.post("/transcribe-audio")
async def transcribe_audio(
    audio: UploadFile = File(...),
    type: Optional[str] = Form("general"),
    video_filename: Optional[str] = Form(None),
    phase_code: Optional[str] = Form(None)
):
    """
    音声ファイルをWhisper APIを使って文字起こしし、Blobストレージに保存する
    
    - **audio**: 音声ファイル (WAV, MP3, M4A等)
    - **type**: 音声の種類 (advice, practice, phase_advice)
    - **video_filename**: 動画ファイル名
    - **phase_code**: スイング段階コード (phase_adviceの場合)
    """
    try:
        logger.info(f"音声文字起こし開始: ファイル名={audio.filename}, タイプ={type}")
        
        # OpenAI APIキーの確認
        if not client.api_key or client.api_key == "your_openai_api_key_here":
            logger.warning("OpenAI APIキーが設定されていません。ダミーレスポンスを返します。")
            return {
                "success": True,
                "transcription": "OpenAI APIキーが設定されていないため、ダミーの文字起こし結果です。実際の音声を文字起こしするには、環境変数OPENAI_API_KEYを設定してください。",
                "type": type,
                "audio_url": None,
                "audio_filename": None,
                "audio_duration": None
            }
        
        # 音声ファイルの検証
        if not audio.content_type or not audio.content_type.startswith('audio/'):
            logger.error(f"無効なファイル形式: {audio.content_type}")
            raise HTTPException(status_code=400, detail="音声ファイルをアップロードしてください")
        
        # 一時ファイルに保存
        with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as temp_file:
            temp_file_path = temp_file.name
            
            # ファイル内容を読み込んで一時ファイルに書き込み
            audio_content = await audio.read()
            temp_file.write(audio_content)
            temp_file.flush()
            
            logger.info(f"一時ファイル作成: {temp_file_path}, サイズ: {len(audio_content)} bytes")
        
        try:
            # OpenAI APIキーの状態をログ出力
            api_key_status = "設定済み" if client.api_key and client.api_key != "your_openai_api_key_here" else "未設定またはダミー"
            logger.info(f"OpenAI APIキー状態: {api_key_status}")
            
            # 音声ファイルサイズをログ出力
            file_size = os.path.getsize(temp_file_path)
            logger.info(f"音声ファイルサイズ: {file_size} bytes")
            
            # 音声ファイルが空または極端に小さい場合の処理
            if file_size < 1000:  # 1KB未満
                logger.warning(f"音声ファイルサイズが小さすぎます: {file_size} bytes")
                return {
                    "success": False,
                    "transcription": "音声データが検出されませんでした。録音時間が短すぎるか、マイクの音量が低い可能性があります。",
                    "type": type,
                    "audio_url": None,
                    "audio_filename": None,
                    "audio_duration": None
                }
            
            # Whisper APIで文字起こし
            logger.info("Whisper APIで文字起こし中...")
            
            with open(temp_file_path, "rb") as audio_file:
                transcript = client.audio.transcriptions.create(
                    model="whisper-1",
                    file=audio_file,
                    language="ja",  # 日本語指定
                    prompt="これはゴルフのスイング指導に関する音声です。専門用語や技術的な内容が含まれます。"
                )
            
            transcription_text = transcript.text
            logger.info(f"文字起こし完了 (長さ: {len(transcription_text)}文字): {transcription_text}")
            
            # 疑わしい結果のフィルタリング
            suspicious_phrases = [
                "ご視聴ありがとうございました",
                "ありがとうございました",
                "Thanks for watching",
                "Thank you for watching"
            ]
            
            if any(phrase in transcription_text for phrase in suspicious_phrases):
                logger.warning(f"疑わしい文字起こし結果を検出: {transcription_text}")
                logger.warning("音声データが無効または録音されていない可能性があります")
                transcription_text = "録音された音声が検出されませんでした。マイクの設定を確認して、もう一度録音してください。"
            
            # 音声ファイルをBlobストレージに保存
            audio_url = None
            try:
                audio_filename = generate_audio_filename(type, video_filename, phase_code)
                logger.info(f"音声ファイル保存中: {audio_filename}")
                
                # 音声データをBytesIOに変換
                audio_stream = io.BytesIO(audio_content)
                audio_url = await storage_service.upload_audio_with_exact_name(audio_stream, audio_filename)
                
                logger.info(f"音声ファイル保存完了: {audio_url}")
            except Exception as e:
                logger.warning(f"音声ファイル保存失敗: {e}")
                # 文字起こしは成功しているので継続
            
            return {
                "success": True,
                "transcription": transcription_text,
                "type": type,
                "audio_url": audio_url,
                "audio_filename": audio_filename if 'audio_filename' in locals() else None,
                "audio_duration": None
            }
            
        finally:
            # 一時ファイルを削除
            try:
                os.unlink(temp_file_path)
                logger.info(f"一時ファイル削除: {temp_file_path}")
            except Exception as e:
                logger.warning(f"一時ファイル削除失敗: {e}")
                
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"音声文字起こしエラー: {str(e)}")
        raise HTTPException(status_code=500, detail=f"音声の文字起こしに失敗しました: {str(e)}")