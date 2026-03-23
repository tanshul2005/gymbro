# backend/app/schemas/user.py
from pydantic import BaseModel, EmailStr, Field
from datetime import datetime
from typing import Optional
from enum import Enum


# ─── Enums ────────────────────────────────────────────────────────────────────

class GenderEnum(str, Enum):
    male = "male"
    female = "female"
    other = "other"


class ActivityLevelEnum(str, Enum):
    sedentary = "sedentary"
    lightly_active = "lightly_active"
    moderately_active = "moderately_active"
    very_active = "very_active"
    extra_active = "extra_active"


# ─── Auth schemas ─────────────────────────────────────────────────────────────

class UserRegister(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=72)


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    id: str
    email: EmailStr
    is_active: bool
    is_verified: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class TokenData(BaseModel):
    user_id: Optional[str] = None


# ─── Profile schemas ──────────────────────────────────────────────────────────

class ProfileUpdate(BaseModel):
    full_name: Optional[str] = Field(None, min_length=1, max_length=255)
    age: Optional[int] = Field(None, ge=10, le=120)
    gender: Optional[GenderEnum] = None
    height_cm: Optional[float] = Field(None, gt=0, le=300)
    weight_kg: Optional[float] = Field(None, gt=0, le=500)
    fitness_goal: Optional[str] = Field(None, max_length=255)
    activity_level: Optional[ActivityLevelEnum] = None


class ProfileOut(BaseModel):
    id: str
    user_id: str
    full_name: Optional[str] = None
    age: Optional[int] = None
    gender: Optional[GenderEnum] = None
    height_cm: Optional[float] = None
    weight_kg: Optional[float] = None
    fitness_goal: Optional[str] = None
    activity_level: Optional[ActivityLevelEnum] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ProfileWithUserOut(BaseModel):
    id: str
    user_id: str
    email: EmailStr
    full_name: Optional[str] = None
    age: Optional[int] = None
    gender: Optional[GenderEnum] = None
    height_cm: Optional[float] = None
    weight_kg: Optional[float] = None
    fitness_goal: Optional[str] = None
    activity_level: Optional[ActivityLevelEnum] = None
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": False}