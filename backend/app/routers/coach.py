from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, Form
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional, Dict, Any
from uuid import UUID
from decimal import Decimal
import json
import datetime

from app.deps import get_database, get_default_coach_id
from app.schemas import (
    SectionGroupCreate, SectionGroupResponse, SwingSectionCreate, SwingSectionResponse,
    CoachCommentRequest, CoachCommentResponse, SwingSectionUpdate, OverallFeedbackRequest, OverallFeedbackResponse
)
from app.crud import section_group_crud, swing_section_crud, video_crud
from app.services.ai import ai_service
from app.services.transcription import transcription_service
from app.services.storage import storage_service

router = APIRouter()

# アドバイスデータ保存・取得用のエンドポイント
@router.post("/save-advices/{video_id}")
async def save_advices(
    video_id: str,
    advices: List[Dict[str, Any]],
    db: AsyncSession = Depends(get_database)
):
    """
    アドバイスデータを保存する
    
    - **video_id**: 動画ID
    - **advices**: アドバイスデータのリスト
    """
    try:
        # データベースに保存（簡易的な実装）
        # 実際の実装では、適切なテーブル構造に合わせて保存する必要があります
        # ここでは一時的にファイルベースの保存を使用
        import os
        from pathlib import Path
        
        # 保存ディレクトリの作成
        save_dir = Path("backend/data/advices")
        save_dir.mkdir(parents=True, exist_ok=True)
        
        # ファイルに保存
        file_path = save_dir / f"{video_id}_advices.json"
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(advices, f, ensure_ascii=False, indent=2)
        
        return {"message": "アドバイスデータが正常に保存されました", "video_id": video_id}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"アドバイスデータの保存に失敗しました: {str(e)}")

@router.get("/get-advices/{video_id}")
async def get_advices(
    video_id: str,
    db: AsyncSession = Depends(get_database)
):
    """
    アドバイスデータを取得する
    
    - **video_id**: 動画ID
    """
    try:
        import os
        from pathlib import Path
        
        # 保存ディレクトリから読み込み
        save_dir = Path("backend/data/advices")
        file_path = save_dir / f"{video_id}_advices.json"
        
        if not file_path.exists():
            return {"advices": []}
        
        with open(file_path, 'r', encoding='utf-8') as f:
            advices = json.load(f)
        
        return {"advices": advices}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"アドバイスデータの取得に失敗しました: {str(e)}")

@router.post("/save-markup-image")
async def save_markup_image(
    image_data: str = Form(...),
    filename: str = Form(...),
    original_url: str = Form(...),
    db: AsyncSession = Depends(get_database)
):
    """
    マークアップ画像データを保存する
    
    - **image_data**: Base64エンコードされた画像データ
    - **filename**: ファイル名
    - **original_url**: 元の画像URL
    """
    try:
        import os
        from pathlib import Path
        
        # 保存ディレクトリの作成
        save_dir = Path("backend/data/markup_images")
        save_dir.mkdir(parents=True, exist_ok=True)
        
        # ファイルに保存
        file_path = save_dir / f"{filename}.json"
        markup_data = {
            "image_data": image_data,
            "filename": filename,
            "original_url": original_url,
            "created_at": str(datetime.datetime.now())
        }
        
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(markup_data, f, ensure_ascii=False, indent=2)
        
        return {"message": "マークアップ画像が正常に保存されました", "filename": filename}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"マークアップ画像の保存に失敗しました: {str(e)}")

@router.get("/get-markup-image/{filename}")
async def get_markup_image(
    filename: str,
    db: AsyncSession = Depends(get_database)
):
    """
    マークアップ画像データを取得する
    
    - **filename**: ファイル名
    """
    try:
        import os
        from pathlib import Path
        
        # 保存ディレクトリから読み込み
        save_dir = Path("backend/data/markup_images")
        file_path = save_dir / f"{filename}.json"
        
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="マークアップ画像が見つかりません")
        
        with open(file_path, 'r', encoding='utf-8') as f:
            markup_data = json.load(f)
        
        return markup_data
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"マークアップ画像の取得に失敗しました: {str(e)}")

@router.post("/create-section-group/{video_id}", response_model=SectionGroupResponse)
async def create_section_group(
    video_id: UUID,
    db: AsyncSession = Depends(get_database)
):
    """
    Create a section group for a video to start adding swing sections
    
    - **video_id**: ID of the video to create sections for
    """
    try:
        # Verify video exists and get with sections
        video = await video_crud.get_video_with_sections(db, video_id)
        if not video:
            raise HTTPException(status_code=404, detail="動画が見つかりません")
        
        # Check if section group already exists
        try:
            if hasattr(video, 'section_groups') and video.section_groups:
                existing_group = video.section_groups[0]
                return existing_group
        except Exception as e:
            print(f"Error checking existing section groups: {e}")
            # Continue to create new section group
        
        # Create new section group
        section_group_data = SectionGroupCreate(video_id=video_id)
        section_group = await section_group_crud.create_section_group(db, section_group_data)
        
        return section_group
        
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        print(f"Full error traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"セクショングループの作成に失敗しました: {str(e)}")

@router.post("/add-section/{section_group_id}", response_model=SwingSectionResponse)
async def add_swing_section(
    section_group_id: UUID,
    start_sec: float = Form(...),
    end_sec: float = Form(...),
    markup_image: Optional[UploadFile] = File(None),
    image_url: Optional[str] = Form(None),
    tags: Optional[str] = Form(None),
    coach_comment: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_database)
):
    """
    Add a swing section to a section group
    
    - **section_group_id**: ID of the section group
    - **start_sec**: Start time in seconds
    - **end_sec**: End time in seconds
    - **markup_image**: Optional markup image file
    - **image_url**: Optional image URL (alternative to markup_image)
    - **tags**: Comma-separated tags (optional)
    - **coach_comment**: Coach comment text (optional)
    """
    try:
        # Verify section group exists
        section_group = await section_group_crud.get_section_group(db, section_group_id)
        if not section_group:
            raise HTTPException(status_code=404, detail="セクショングループが見つかりません")
        
        # Validate time range
        if start_sec >= end_sec:
            raise HTTPException(status_code=400, detail="開始時刻は終了時刻より前である必要があります")
        
        final_image_url = None
        if markup_image and markup_image.filename:
            # Validate image file
            if not markup_image.content_type or not markup_image.content_type.startswith('image/'):
                raise HTTPException(status_code=400, detail="マークアップファイルは画像ファイルである必要があります")
            
            # Upload markup image
            final_image_url = await storage_service.upload_image(
                markup_image.file,
                markup_image.filename
            )
        elif image_url:
            # Use provided image URL directly
            final_image_url = image_url
        
        # Parse tags if provided
        parsed_tags = None
        if tags:
            parsed_tags = [tag.strip() for tag in tags.split(',') if tag.strip()]
        
        # Create section
        section_data = SwingSectionCreate(
            section_group_id=section_group_id,
            start_sec=Decimal(str(start_sec)),
            end_sec=Decimal(str(end_sec)),
            image_url=final_image_url,
            tags=parsed_tags
        )
        
        section = await swing_section_crud.create_section(db, section_data)
        
        # Add coach comment if provided
        if coach_comment and section:
            # Generate summary using AI
            try:
                summary = await ai_service.summarize_coach_comment(coach_comment)
            except Exception as e:
                # Fallback to simple truncation if AI fails
                print(f"AI summarization failed: {e}")
                summary = coach_comment[:200] + "..." if len(coach_comment) > 200 else coach_comment
            
            # Update section with comment and summary
            updated_section = await swing_section_crud.add_coach_comment(
                db, section.section_id, coach_comment, summary
            )
            if updated_section:
                section = updated_section
        
        return section
        
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        print(f"Full error traceback for add_swing_section: {traceback.format_exc()}")
        print(f"Section group ID: {section_group_id}")
        print(f"Start sec: {start_sec}, End sec: {end_sec}")
        print(f"Tags: {tags}")
        print(f"Coach comment: {coach_comment}")
        raise HTTPException(status_code=500, detail=f"セクションの追加に失敗しました: {str(e)}")

@router.post("/add-coach-comment/{section_id}", response_model=CoachCommentResponse)
async def add_coach_comment(
    section_id: UUID,
    audio_file: UploadFile = File(...),
    coach_id: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_database)
):
    """
    Add coach comment via audio transcription
    
    - **section_id**: ID of the swing section
    - **audio_file**: Audio file with coach commentary
    - **coach_id**: Coach ID (optional, uses default if not provided)
    """
    try:
        # Verify section exists
        section = await swing_section_crud.get_section(db, section_id)
        if not section:
            raise HTTPException(status_code=404, detail="セクションが見つかりません")
        
        # Validate audio file format
        if not await transcription_service.validate_audio_format(audio_file.file):
            raise HTTPException(status_code=400, detail="サポートされていない音声ファイル形式です")
        
        # Transcribe audio to text
        try:
            transcribed_text = await transcription_service.transcribe_audio(audio_file.file)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"音声の文字起こしに失敗しました: {str(e)}")
        
        # Generate summary using AI
        try:
            summary = await ai_service.summarize_coach_comment(transcribed_text)
        except Exception as e:
            # Fallback to simple truncation if AI fails
            print(f"AI summarization failed: {e}")
            summary = transcribed_text[:200] + "..." if len(transcribed_text) > 200 else transcribed_text
        
        # Update section with comment and summary
        updated_section = await swing_section_crud.add_coach_comment(
            db, section_id, transcribed_text, summary
        )
        
        if not updated_section:
            raise HTTPException(status_code=500, detail="コメントの保存に失敗しました")
        
        return CoachCommentResponse(
            section_id=section_id,
            comment=transcribed_text,
            summary=summary
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"コーチコメントの追加に失敗しました: {str(e)}")

@router.put("/update-section/{section_id}", response_model=SwingSectionResponse)
async def update_swing_section(
    section_id: UUID,
    section_update: SwingSectionUpdate,
    db: AsyncSession = Depends(get_database)
):
    """
    Update swing section details
    
    - **section_id**: ID of the section to update
    - **section_update**: Updated section data
    """
    try:
        # Verify section exists
        section = await swing_section_crud.get_section(db, section_id)
        if not section:
            raise HTTPException(status_code=404, detail="セクションが見つかりません")
        
        # Update section
        updated_section = await swing_section_crud.update_section(db, section_id, section_update)
        
        if not updated_section:
            raise HTTPException(status_code=500, detail="セクションの更新に失敗しました")
        
        return updated_section
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"セクションの更新に失敗しました: {str(e)}")

@router.get("/section/{section_id}", response_model=SwingSectionResponse)
async def get_swing_section(
    section_id: UUID,
    db: AsyncSession = Depends(get_database)
):
    """
    Get swing section details
    
    - **section_id**: ID of the section
    """
    try:
        section = await swing_section_crud.get_section(db, section_id)
        if not section:
            raise HTTPException(status_code=404, detail="セクションが見つかりません")
        
        return section
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"セクション情報の取得に失敗しました: {str(e)}")

@router.get("/sections/{section_group_id}", response_model=List[SwingSectionResponse])
async def get_sections_by_group(
    section_group_id: UUID,
    db: AsyncSession = Depends(get_database)
):
    """
    Get all sections for a section group
    
    - **section_group_id**: ID of the section group
    """
    try:
        sections = await swing_section_crud.get_sections_by_group(db, section_group_id)
        return sections
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"セクション一覧の取得に失敗しました: {str(e)}")

@router.delete("/section/{section_id}")
async def delete_swing_section(
    section_id: UUID,
    db: AsyncSession = Depends(get_database)
):
    """
    Delete a swing section
    
    - **section_id**: ID of the section to delete
    """
    try:
        # Get section to retrieve image URL for cleanup
        section = await swing_section_crud.get_section(db, section_id)
        if not section:
            raise HTTPException(status_code=404, detail="セクションが見つかりません")
        
        # Delete image from storage if exists
        if section.image_url:
            try:
                await storage_service.delete_file(section.image_url)
            except Exception as e:
                print(f"Warning: Failed to delete section image: {e}")
        
        # Delete section from database
        success = await swing_section_crud.delete_section(db, section_id)
        if not success:
            raise HTTPException(status_code=404, detail="セクションが見つかりません")
        
        return {"message": "セクションが正常に削除されました"}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"セクションの削除に失敗しました: {str(e)}")

@router.post("/analyze-section/{section_id}")
async def analyze_swing_section(
    section_id: UUID,
    db: AsyncSession = Depends(get_database)
):
    """
    Analyze swing section using AI to suggest tags and insights
    
    - **section_id**: ID of the section to analyze
    """
    try:
        # Get section data
        section = await swing_section_crud.get_section(db, section_id)
        if not section:
            raise HTTPException(status_code=404, detail="セクションが見つかりません")
        
        # Prepare section data for AI analysis
        section_data = {
            "start_sec": float(section.start_sec),
            "end_sec": float(section.end_sec),
            "coach_comment": section.coach_comment or "",
            "existing_tags": section.tags or []
        }
        
        # Perform AI analysis
        analysis = await ai_service.analyze_swing_section(section_data)
        
        return {
            "section_id": section_id,
            "analysis": analysis,
            "current_tags": section.tags,
            "suggested_improvements": analysis.get("reasoning", "")
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"セクション分析に失敗しました: {str(e)}")

@router.post("/add-overall-feedback/{section_group_id}", response_model=OverallFeedbackResponse)
async def add_overall_feedback(
    section_group_id: UUID,
    audio_file: UploadFile = File(...),
    feedback_type: str = Form(...),  # "overall" or "next_training"
    coach_id: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_database)
):
    """
    Add overall feedback via audio transcription
    
    - **section_group_id**: ID of the section group
    - **audio_file**: Audio file with coach overall feedback
    - **feedback_type**: Type of feedback ("overall" or "next_training")
    - **coach_id**: Coach ID (optional, uses default if not provided)
    """
    try:
        # Verify section group exists
        section_group = await section_group_crud.get_section_group(db, section_group_id)
        if not section_group:
            raise HTTPException(status_code=404, detail="セクショングループが見つかりません")
        
        # Validate feedback type
        if feedback_type not in ["overall", "next_training"]:
            raise HTTPException(status_code=400, detail="フィードバックタイプは 'overall' または 'next_training' である必要があります")
        
        # Validate audio file format
        if not await transcription_service.validate_audio_format(audio_file.file):
            raise HTTPException(status_code=400, detail="サポートされていない音声ファイル形式です")
        
        # Transcribe audio to text
        try:
            transcribed_text = await transcription_service.transcribe_audio(audio_file.file)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"音声の文字起こしに失敗しました: {str(e)}")
        
        # Generate summary using AI
        try:
            if feedback_type == "overall":
                summary = await ai_service.summarize_overall_feedback(transcribed_text)
            else:  # next_training
                summary = await ai_service.summarize_training_menu(transcribed_text)
        except Exception as e:
            # Fallback to simple truncation if AI fails
            print(f"AI summarization failed: {e}")
            summary = transcribed_text[:200] + "..." if len(transcribed_text) > 200 else transcribed_text
        
        # Update section group with feedback
        if feedback_type == "overall":
            updated_section_group = await section_group_crud.add_overall_feedback(
                db, section_group_id, transcribed_text, summary
            )
        else:  # next_training
            updated_section_group = await section_group_crud.add_next_training_menu(
                db, section_group_id, transcribed_text, summary
            )
        
        if not updated_section_group:
            raise HTTPException(status_code=500, detail="フィードバックの保存に失敗しました")
        
        return OverallFeedbackResponse(
            section_group_id=section_group_id,
            overall_feedback=updated_section_group.overall_feedback,
            overall_feedback_summary=updated_section_group.overall_feedback_summary,
            next_training_menu=updated_section_group.next_training_menu,
            next_training_menu_summary=updated_section_group.next_training_menu_summary,
            feedback_created_at=updated_section_group.feedback_created_at
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"総評の追加に失敗しました: {str(e)}")

@router.get("/overall-feedback/{section_group_id}", response_model=OverallFeedbackResponse)
async def get_overall_feedback(
    section_group_id: UUID,
    db: AsyncSession = Depends(get_database)
):
    """
    Get overall feedback for a section group
    
    - **section_group_id**: ID of the section group
    """
    try:
        section_group = await section_group_crud.get_section_group(db, section_group_id)
        if not section_group:
            raise HTTPException(status_code=404, detail="セクショングループが見つかりません")
        
        return OverallFeedbackResponse(
            section_group_id=section_group_id,
            overall_feedback=section_group.overall_feedback,
            overall_feedback_summary=section_group.overall_feedback_summary,
            next_training_menu=section_group.next_training_menu,
            next_training_menu_summary=section_group.next_training_menu_summary,
            feedback_created_at=section_group.feedback_created_at
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"総評の取得に失敗しました: {str(e)}")