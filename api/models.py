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

class StartRequest(BaseModel):
    problem: str


class SettingsUpdateRequest(BaseModel):
    user_instance_limit: int
