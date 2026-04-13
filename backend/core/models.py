from pydantic import BaseModel

class RegisterRequest(BaseModel):
    username: str
    password: str
    display_name: str | None = None

class LoginRequest(BaseModel):
    username: str
    password: str

class RoleUpdateRequest(BaseModel):
    role: str


class PasswordResetRequest(BaseModel):
    password: str

class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

class StartRequest(BaseModel):
    problem: str


class SettingsUpdateRequest(BaseModel):
    user_instance_limit: int | None = None
    ranking_open: bool | None = None
    ranking_closed_message: str | None = None
    challenges_open: bool | None = None
    challenges_open_at: str | None = None
    challenges_close_at: str | None = None
    challenges_closed_message: str | None = None
    ranking_open_at: str | None = None
    ranking_close_at: str | None = None


class UserApprovalActionRequest(BaseModel):
    action: str | None = None


class SubmitRequest(BaseModel):
    problem: str
    flag: str
