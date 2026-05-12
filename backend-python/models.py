import uuid
import enum
from datetime import datetime
from sqlalchemy import Column, String, Integer, Boolean, ForeignKey, DateTime, Text, Float, Enum as SQLEnum
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base

# МОДЕЛИ БАЗЫ ДАННЫХ ПЛАТФОРМЫ
# Определение перечислений для ролей, статусов и состояний комнат
class RoleEnum(str, enum.Enum):
    owner = 'owner'
    admin = 'admin'
    manager = 'manager'
    member = 'member'
    guest = 'guest'

class StatusEnum(str, enum.Enum):
    active = 'active'
    invited = 'invited'
    suspended = 'suspended'
    deactivated = 'deactivated'

class RoomStatusEnum(str, enum.Enum):
    scheduled = 'scheduled'
    active = 'active'
    recording = 'recording'
    paused = 'paused'
    ended = 'ended'
    archived = 'archived'

# ОСНОВНЫЕ СУЩНОСТИ
class Tier(Base):
    __tablename__ = 'tiers'
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(100), nullable=False)
    slug = Column(String(50), nullable=False, unique=True)
    price_monthly = Column(Float, nullable=False)
    price_yearly = Column(Float)
    max_users = Column(Integer, nullable=False)
    ai_features_enabled = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=func.now(), nullable=False)

class Organization(Base):
    __tablename__ = 'organizations'
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    slug = Column(String(100), nullable=False, unique=True)
    tier_id = Column(UUID(as_uuid=True), ForeignKey('tiers.id', ondelete='SET NULL'))
    subscription_ends_at = Column(DateTime)
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)

    users = relationship("User", back_populates="organization")

class User(Base):
    __tablename__ = 'users'
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False)
    email = Column(String(255), nullable=False)
    password_hash = Column(String(255), nullable=False)
    username = Column(String(100), unique=True)
    first_name = Column(String(100), nullable=False)
    last_name = Column(String(100))
    role = Column(SQLEnum(RoleEnum), default=RoleEnum.member, nullable=False)
    status = Column(SQLEnum(StatusEnum), default=StatusEnum.active, nullable=False)
    invite_token = Column(String(255))
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)

    organization = relationship("Organization", back_populates="users")
    rooms_created = relationship("Room", back_populates="creator")

class Team(Base):
    __tablename__ = 'teams'
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False)
    name = Column(String(100), nullable=False)
    color = Column(String(7))
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)

class TeamMember(Base):
    __tablename__ = 'team_members'
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    team_id = Column(UUID(as_uuid=True), ForeignKey('teams.id', ondelete='CASCADE'), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    role_in_team = Column(String(20), default='member', nullable=False)

# КОНФЕРЕНЦИИ И УЧАСТНИКИ
class Room(Base):
    __tablename__ = 'rooms'
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False)
    creator_id = Column(UUID(as_uuid=True), ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    team_id = Column(UUID(as_uuid=True), ForeignKey('teams.id', ondelete='SET NULL'))
    name = Column(String(200), nullable=False)
    description = Column(Text)
    invite_code = Column(String(50), nullable=False, unique=True)
    status = Column(SQLEnum(RoomStatusEnum), default=RoomStatusEnum.scheduled, nullable=False)
    scheduled_start_at = Column(DateTime)
    scheduled_end_at = Column(DateTime)
    started_at = Column(DateTime)
    ended_at = Column(DateTime)
    duration_seconds = Column(Integer)
    chat_enabled = Column(Boolean, default=True, nullable=False)
    reminder_sent = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)

    creator = relationship("User", back_populates="rooms_created")
    
    # ИСПРАВЛЕНИЕ: Добавляем cascade="all, delete-orphan"
    participants = relationship(
        "Participant", 
        back_populates="room", 
        cascade="all, delete-orphan" 
    )
    

class Participant(Base):
    __tablename__ = 'participants'
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    room_id = Column(UUID(as_uuid=True), ForeignKey('rooms.id', ondelete='CASCADE'), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey('users.id', ondelete='SET NULL'))
    role_in_room = Column(String(20), default='participant', nullable=False)
    joined_at = Column(DateTime, default=func.now(), nullable=False)
    left_at = Column(DateTime)
    is_muted = Column(Boolean, default=False, nullable=False)
    hand_raised = Column(Boolean, default=False, nullable=False)
    connection_quality = Column(Integer)
    client_info = Column(JSONB)
    session_id = Column(String(100))
    created_at = Column(DateTime, default=func.now(), nullable=False)

    room = relationship("Room", back_populates="participants")
    user = relationship("User")

class ChatMessage(Base):
    __tablename__ = 'chat_messages'
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    room_id = Column(UUID(as_uuid=True), ForeignKey('rooms.id', ondelete='CASCADE'), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey('users.id', ondelete='SET NULL'))
    message = Column(Text, nullable=False)
    reply_to_id = Column(UUID(as_uuid=True), ForeignKey('chat_messages.id', ondelete='SET NULL'))
    created_at = Column(DateTime, default=func.now(), nullable=False)
    edited_at = Column(DateTime, nullable=True)
    deleted_at = Column(DateTime, nullable=True)

class Recording(Base):
    __tablename__ = 'recordings'
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    room_id = Column(UUID(as_uuid=True), ForeignKey('rooms.id', ondelete='CASCADE'), nullable=False)
    started_at = Column(DateTime, nullable=False)
    ended_at = Column(DateTime)
    duration_seconds = Column(Integer)
    file_url = Column(String(500))
    is_processed = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=func.now(), nullable=False)

# ИИ-ПРОТОКОЛИРОВАНИЕ
class Protocol(Base):
    __tablename__ = 'protocols'
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    room_id = Column(UUID(as_uuid=True), ForeignKey('rooms.id', ondelete='CASCADE'), nullable=False)
    recording_id = Column(UUID(as_uuid=True), ForeignKey('recordings.id', ondelete='SET NULL'))
    created_by = Column(UUID(as_uuid=True), ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    title = Column(String(255), nullable=False)
    content_json = Column(JSONB, nullable=False)
    summary_json = Column(JSONB)
    decisions_json = Column(JSONB)
    action_items_json = Column(JSONB)
    topics_json = Column(JSONB)
    pdf_url = Column(String(500))
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)

class ActionItem(Base):
    __tablename__ = 'action_items'
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    protocol_id = Column(UUID(as_uuid=True), ForeignKey('protocols.id', ondelete='CASCADE'), nullable=False)
    room_id = Column(UUID(as_uuid=True), ForeignKey('rooms.id', ondelete='CASCADE'), nullable=False)
    assignee_id = Column(UUID(as_uuid=True), ForeignKey('users.id', ondelete='SET NULL'))
    created_by = Column(UUID(as_uuid=True), ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    title = Column(String(500), nullable=False)
    description = Column(Text)
    deadline = Column(DateTime)
    status = Column(String(20), default='pending', nullable=False)
    completed_at = Column(DateTime)
    completed_by = Column(UUID(as_uuid=True), ForeignKey('users.id', ondelete='SET NULL'))
    source_text = Column(Text)
    confidence = Column(Float)
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)