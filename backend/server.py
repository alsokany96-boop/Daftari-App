from fastapi import FastAPI, APIRouter, HTTPException, Depends, status
from fastapi.security import OAuth2PasswordBearer
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import secrets
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Annotated
import uuid
from datetime import datetime, timedelta, timezone
from jose import JWTError, jwt
from passlib.context import CryptContext


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

SECRET_KEY = os.environ.get('JWT_SECRET_KEY', 'daftari-super-secret-change-in-prod-xyz-123')
ALGORITHM = 'HS256'
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 30
VERIFICATION_CODE_TTL_MIN = 15  # OTP validity minutes

SUPER_ADMIN_USERNAME = os.environ.get('SUPER_ADMIN_USERNAME', 'admin').lower().strip()
ADMIN_PHONE = os.environ.get('ADMIN_PHONE', '0926609606')
ADMIN_WHATSAPP = os.environ.get('ADMIN_WHATSAPP', '218926609606')
SUBSCRIPTION_PRICE = float(os.environ.get('SUBSCRIPTION_PRICE', '20'))
FREE_TIER_LIMIT = int(os.environ.get('FREE_TIER_LIMIT', '10'))

pwd_context = CryptContext(schemes=['bcrypt'], deprecated='auto')
oauth2_scheme = OAuth2PasswordBearer(tokenUrl='/api/auth/login')

app = FastAPI()
api_router = APIRouter(prefix='/api')


# =============== MODELS =================
class UserRegister(BaseModel):
    username: str
    password: str
    shop_name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None


class UserLogin(BaseModel):
    username: str
    password: str


class UserPublic(BaseModel):
    id: str
    username: str
    shop_name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    role: str
    is_active: bool
    parent_owner_id: Optional[str] = None
    created_at: Optional[str] = None
    subscription_expires_at: Optional[str] = None
    customer_count: int = 0
    is_locked: bool = False
    free_tier_limit: int = 10


class Token(BaseModel):
    access_token: str
    token_type: str
    user: UserPublic


class Store(BaseModel):
    id: str
    owner_id: str
    name: str
    icon: Optional[str] = 'storefront'
    created_at: str


class StoreCreate(BaseModel):
    name: str
    icon: Optional[str] = 'storefront'


class StoreUpdate(BaseModel):
    name: Optional[str] = None
    icon: Optional[str] = None


class CustomerCreate(BaseModel):
    name: str
    phone: str
    max_debt: Optional[float] = None
    party_type: str = 'customer'  # 'customer' | 'supplier'
    store_id: Optional[str] = None


class CustomerUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    max_debt: Optional[float] = None


class Customer(BaseModel):
    id: str
    owner_id: str
    store_id: str
    party_type: str
    name: str
    phone: str
    max_debt: Optional[float] = None
    created_at: str
    total_debt: float = 0.0
    last_transaction_at: Optional[str] = None


class TransactionCreate(BaseModel):
    customer_id: str
    type: str
    amount: float
    notes: Optional[str] = None
    receipt_image: Optional[str] = None


class TransactionUpdate(BaseModel):
    amount: Optional[float] = None
    notes: Optional[str] = None


class Transaction(BaseModel):
    id: str
    customer_id: str
    owner_id: str
    store_id: str
    party_type: str
    author_id: str
    type: str
    amount: float
    notes: Optional[str] = None
    receipt_image: Optional[str] = None
    created_at: str


class Settings(BaseModel):
    reminder_enabled: bool = True
    reminder_frequency: str = 'weekly'
    reminder_custom_days: int = 7
    reminder_template: str = 'مرحباً {name}، نود تذكيرك بأن حسابك الحالي في {shop} هو {amount} {currency}. نسعد بزيارتك.'
    # Templates sent right after saving a transaction. {name} = party, {amount},
    # {balance}, {shop}, {currency} are interpolated at send time.
    customer_debt_template: str = 'مرحباً {name}، تم إضافة مبلغ {amount} {currency} إلى حسابك في {shop}. رصيدك الحالي: {balance} {currency}.'
    customer_payment_template: str = 'مرحباً {name}، شكراً لك على السداد. تم استلام {amount} {currency} في {shop}. رصيدك الحالي: {balance} {currency}.'
    supplier_debt_template: str = 'مرحباً {name}، تم تسجيل بضاعة بالآجل بقيمة {amount} {currency}. إجمالي حسابكم لدينا: {balance} {currency}. شكراً لكم.'
    supplier_payment_template: str = 'مرحباً {name}، تم تسليمكم دفعة بقيمة {amount} {currency}. إجمالي حسابكم لدينا: {balance} {currency}. شكراً لكم.'


class SettingsUpdate(BaseModel):
    reminder_enabled: Optional[bool] = None
    reminder_frequency: Optional[str] = None
    reminder_custom_days: Optional[int] = None
    reminder_template: Optional[str] = None
    customer_debt_template: Optional[str] = None
    customer_payment_template: Optional[str] = None
    supplier_debt_template: Optional[str] = None
    supplier_payment_template: Optional[str] = None


class StaffCreate(BaseModel):
    username: str
    password: str
    display_name: Optional[str] = None


class StaffUpdate(BaseModel):
    password: Optional[str] = None
    display_name: Optional[str] = None
    is_active: Optional[bool] = None


class ResetPasswordRequest(BaseModel):
    new_password: str


class ExtendSubscriptionRequest(BaseModel):
    days: int = 30


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str
    verification_code: Optional[str] = None  # Required for employees


class ProfileUpdateRequest(BaseModel):
    shop_name: Optional[str] = None
    phone: Optional[str] = None


class ForgotPinRequest(BaseModel):
    username: str


class ResetPinRequest(BaseModel):
    username: str
    code: str
    new_password: str


class VerificationCode(BaseModel):
    id: str
    code: str
    owner_id: str
    purpose: str
    expires_at: str
    used_at: Optional[str] = None
    created_at: str


class ResetCode(BaseModel):
    id: str
    code: str
    user_id: str
    username: str
    phone: Optional[str] = None
    email: Optional[str] = None
    expires_at: str
    used_at: Optional[str] = None
    created_at: str


class PublicConfig(BaseModel):
    admin_phone: str
    admin_whatsapp: str
    subscription_price: float
    free_tier_limit: int


class AdminConfigUpdate(BaseModel):
    subscription_price: Optional[float] = None
    free_tier_limit: Optional[int] = None
    admin_phone: Optional[str] = None
    admin_whatsapp: Optional[str] = None


# =============== HELPERS =================
def hash_password(password: str) -> str:
    return pwd_context.hash(password)


APP_CONFIG_ID = 'global'


async def get_app_config() -> dict:
    """Return the app-wide, admin-editable config document. Creates it with
    defaults from the environment on first access."""
    doc = await db.app_config.find_one({'id': APP_CONFIG_ID}, {'_id': 0})
    if doc:
        return doc
    doc = {
        'id': APP_CONFIG_ID,
        'subscription_price': SUBSCRIPTION_PRICE,
        'free_tier_limit': FREE_TIER_LIMIT,
        'admin_phone': ADMIN_PHONE,
        'admin_whatsapp': ADMIN_WHATSAPP,
        'updated_at': datetime.now(timezone.utc).isoformat(),
    }
    await db.app_config.insert_one(doc.copy())
    return doc


async def get_effective_free_tier_limit() -> int:
    cfg = await get_app_config()
    try:
        return max(1, int(cfg.get('free_tier_limit', FREE_TIER_LIMIT)))
    except (TypeError, ValueError):
        return FREE_TIER_LIMIT


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({'exp': expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def to_user_public(u: dict) -> UserPublic:
    """Sync fallback that reflects the physical is_active flag only.
    Prefer to_user_public_effective(u) whenever the effective (subscription/limit
    aware) status is required."""
    return UserPublic(
        id=u['id'],
        username=u['username'],
        shop_name=u.get('shop_name'),
        phone=u.get('phone'),
        email=u.get('email'),
        role=u.get('role', 'owner'),
        is_active=bool(u.get('is_active', True)),
        parent_owner_id=u.get('parent_owner_id'),
        created_at=u.get('created_at'),
        subscription_expires_at=u.get('subscription_expires_at'),
        customer_count=0,
        is_locked=False,
        free_tier_limit=FREE_TIER_LIMIT,
    )


async def get_owner_max_customer_count(owner_id: str) -> int:
    """Return the highest customer (party_type='customer') count across ANY
    single store owned by owner_id. Suppliers are NOT counted."""
    pipeline = [
        {'$match': {'owner_id': owner_id, 'party_type': 'customer'}},
        {'$group': {'_id': '$store_id', 'n': {'$sum': 1}}},
        {'$sort': {'n': -1}},
        {'$limit': 1},
    ]
    async for row in db.customers.aggregate(pipeline):
        return int(row.get('n', 0))
    return 0


def is_subscription_active(exp: Optional[str]) -> bool:
    return bool(exp) and exp > now_iso()


async def compute_effective_status(user: dict) -> dict:
    """Compute lock/subscription meta for a user.
    Rules:
      - super_admin: never locked, always active
      - owner: locked if max(store_customers) >= FREE_TIER_LIMIT AND no active subscription
      - employee: inherits owner's lock; and is deactivated if either the parent
        owner is locked or the employee's own is_active flag is False.
    """
    role = user.get('role', 'owner')
    physical_active = bool(user.get('is_active', True))
    limit = await get_effective_free_tier_limit()
    if role == 'super_admin':
        return {
            'effective_active': True,
            'is_locked': False,
            'customer_count': 0,
            'subscription_expires_at': None,
            'free_tier_limit': limit,
        }

    owner = user
    if role == 'employee' and user.get('parent_owner_id'):
        parent = await db.users.find_one({'id': user['parent_owner_id']}, {'_id': 0})
        if parent:
            owner = parent

    count = await get_owner_max_customer_count(owner['id'])
    exp = owner.get('subscription_expires_at')
    sub_active = is_subscription_active(exp)
    is_locked = count >= limit and not sub_active

    effective = physical_active and not is_locked
    if role == 'employee':
        effective = effective and bool(owner.get('is_active', True))

    return {
        'effective_active': effective,
        'is_locked': is_locked,
        'customer_count': count,
        'subscription_expires_at': exp,
        'free_tier_limit': limit,
    }


async def to_user_public_effective(u: dict) -> UserPublic:
    meta = await compute_effective_status(u)
    return UserPublic(
        id=u['id'],
        username=u['username'],
        shop_name=u.get('shop_name'),
        phone=u.get('phone'),
        email=u.get('email'),
        role=u.get('role', 'owner'),
        is_active=bool(meta['effective_active']),
        parent_owner_id=u.get('parent_owner_id'),
        created_at=u.get('created_at'),
        subscription_expires_at=meta['subscription_expires_at'],
        customer_count=int(meta['customer_count']),
        is_locked=bool(meta['is_locked']),
        free_tier_limit=int(meta['free_tier_limit']),
    )


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def gen_otp(n: int = 6) -> str:
    return ''.join(secrets.choice('0123456789') for _ in range(n))


async def get_current_user(token: Annotated[str, Depends(oauth2_scheme)]) -> dict:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail='Could not validate credentials',
        headers={'WWW-Authenticate': 'Bearer'},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get('sub')
        if not user_id:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    user = await db.users.find_one({'id': user_id}, {'_id': 0})
    if not user:
        raise credentials_exception
    return user


async def require_active_user(current_user: Annotated[dict, Depends(get_current_user)]) -> dict:
    if current_user.get('role') == 'super_admin':
        return current_user
    meta = await compute_effective_status(current_user)
    if not meta['effective_active']:
        raise HTTPException(status_code=403, detail='الاشتراك غير مفعّل')
    return current_user


async def require_owner_or_admin(current_user: Annotated[dict, Depends(require_active_user)]) -> dict:
    role = current_user.get('role', 'owner')
    if role not in ('owner', 'super_admin'):
        raise HTTPException(status_code=403, detail='هذه العملية متاحة للمالك فقط')
    return current_user


async def require_super_admin(current_user: Annotated[dict, Depends(require_active_user)]) -> dict:
    if current_user.get('role') != 'super_admin':
        raise HTTPException(status_code=403, detail='صلاحيات المشرف فقط')
    return current_user


CurrentUser = Annotated[dict, Depends(require_active_user)]
CurrentOwner = Annotated[dict, Depends(require_owner_or_admin)]
CurrentSuperAdmin = Annotated[dict, Depends(require_super_admin)]


def root_owner_id(user: dict) -> str:
    if user.get('role') == 'employee' and user.get('parent_owner_id'):
        return user['parent_owner_id']
    return user['id']


async def ensure_default_store(owner_id: str) -> dict:
    """Return an existing store or create a default one for this owner."""
    store = await db.stores.find_one({'owner_id': owner_id}, {'_id': 0})
    if store:
        return store
    doc = {
        'id': str(uuid.uuid4()),
        'owner_id': owner_id,
        'name': 'المحل الرئيسي',
        'icon': 'storefront',
        'created_at': now_iso(),
    }
    await db.stores.insert_one(doc.copy())
    return doc


async def resolve_store_id(user: dict, provided_store_id: Optional[str]) -> str:
    owner = root_owner_id(user)
    # Employees are strictly pinned to the owner's default (first) store. Any
    # store_id they pass in the request body/query is ignored so they can never
    # peek at or write into another store.
    if user.get('role') == 'employee':
        default = await ensure_default_store(owner)
        return default['id']
    if provided_store_id:
        store = await db.stores.find_one({'id': provided_store_id, 'owner_id': owner}, {'_id': 0})
        if not store:
            raise HTTPException(status_code=404, detail='المحل غير موجود')
        return provided_store_id
    default = await ensure_default_store(owner)
    return default['id']


def to_customer(c: dict, totals: dict) -> Customer:
    return Customer(
        id=c.get('id', ''),
        owner_id=c.get('owner_id', ''),
        store_id=c.get('store_id', ''),
        party_type=c.get('party_type', 'customer'),
        name=c.get('name', ''),
        phone=c.get('phone', ''),
        max_debt=c.get('max_debt'),
        created_at=c.get('created_at', ''),
        total_debt=totals.get('total_debt', 0.0),
        last_transaction_at=totals.get('last_transaction_at'),
    )


def to_transaction(t: dict) -> Transaction:
    return Transaction(
        id=t.get('id', ''),
        customer_id=t.get('customer_id', ''),
        owner_id=t.get('owner_id', ''),
        store_id=t.get('store_id', ''),
        party_type=t.get('party_type', 'customer'),
        author_id=t.get('author_id', t.get('owner_id', '')),
        type=t.get('type', 'debt'),
        amount=float(t.get('amount', 0)),
        notes=t.get('notes'),
        receipt_image=t.get('receipt_image'),
        created_at=t.get('created_at', ''),
    )


async def compute_customer_totals(customer_id: str, owner_id: str, store_id: str) -> dict:
    cursor = db.transactions.find(
        {'customer_id': customer_id, 'owner_id': owner_id, 'store_id': store_id},
        {'_id': 0},
    )
    total = 0.0
    last_at: Optional[str] = None
    async for t in cursor:
        if t['type'] == 'debt':
            total += float(t['amount'])
        else:
            total -= float(t['amount'])
        if last_at is None or t['created_at'] > last_at:
            last_at = t['created_at']
    return {'total_debt': round(total, 2), 'last_transaction_at': last_at}


# =============== ROUTES =================
@api_router.get('/')
async def root():
    return {'message': 'Daftari API'}


@api_router.get('/config', response_model=PublicConfig)
async def public_config():
    cfg = await get_app_config()
    return PublicConfig(
        admin_phone=cfg.get('admin_phone', ADMIN_PHONE),
        admin_whatsapp=cfg.get('admin_whatsapp', ADMIN_WHATSAPP),
        subscription_price=float(cfg.get('subscription_price', SUBSCRIPTION_PRICE)),
        free_tier_limit=int(cfg.get('free_tier_limit', FREE_TIER_LIMIT)),
    )


# ---------- AUTH ----------
@api_router.post('/auth/register', response_model=Token)
async def register(payload: UserRegister):
    username = payload.username.lower().strip()
    existing = await db.users.find_one({'username': username})
    if existing:
        raise HTTPException(status_code=400, detail='اسم المستخدم مستخدم بالفعل')

    if username == SUPER_ADMIN_USERNAME:
        role, is_active = 'super_admin', True
    else:
        role = 'owner'
        # Free-tier is now enforced per-store (any store >= FREE_TIER_LIMIT
        # customers locks the owner). New signups are always physically active;
        # the lock kicks in dynamically once they exceed the limit.
        is_active = True

    user_id = str(uuid.uuid4())
    user_doc = {
        'id': user_id,
        'username': username,
        'password_hash': hash_password(payload.password),
        'shop_name': payload.shop_name,
        'phone': payload.phone,
        'email': (payload.email or '').strip().lower() or None,
        'role': role,
        'is_active': is_active,
        'parent_owner_id': None,
        'subscription_expires_at': None,
        'created_at': now_iso(),
    }
    await db.users.insert_one(user_doc)
    if role == 'owner':
        await ensure_default_store(user_id)
    token = create_access_token({'sub': user_id})
    return Token(access_token=token, token_type='bearer', user=await to_user_public_effective(user_doc))


@api_router.post('/auth/login', response_model=Token)
async def login(payload: UserLogin):
    user = await db.users.find_one({'username': payload.username.lower().strip()}, {'_id': 0})
    if not user or not verify_password(payload.password, user['password_hash']):
        raise HTTPException(status_code=401, detail='اسم المستخدم أو كلمة المرور غير صحيحة')
    token = create_access_token({'sub': user['id']})
    return Token(access_token=token, token_type='bearer', user=await to_user_public_effective(user))


@api_router.get('/auth/me', response_model=UserPublic)
async def me(current_user: Annotated[dict, Depends(get_current_user)]):
    return await to_user_public_effective(current_user)


@api_router.put('/auth/profile', response_model=UserPublic)
async def update_own_profile(
    payload: ProfileUpdateRequest,
    current_user: Annotated[dict, Depends(get_current_user)],
):
    """Users update their own display name (shop_name) and phone in-app.
    Deliberately uses `get_current_user` (not `require_active_user`) so admins
    and locked owners can still fix their contact info.
    """
    updates: dict = {}
    if payload.shop_name is not None:
        cleaned = payload.shop_name.strip()
        updates['shop_name'] = cleaned or None
    if payload.phone is not None:
        cleaned = payload.phone.strip()
        updates['phone'] = cleaned or None
    if updates:
        await db.users.update_one({'id': current_user['id']}, {'$set': updates})
    u = await db.users.find_one({'id': current_user['id']}, {'_id': 0})
    return await to_user_public_effective(u)


@api_router.post('/auth/change-password')
async def change_password(payload: ChangePasswordRequest, current_user: CurrentUser):
    if not payload.new_password or len(payload.new_password) < 4:
        raise HTTPException(status_code=400, detail='كلمة المرور الجديدة يجب أن تكون 4 أحرف على الأقل')
    stored = await db.users.find_one({'id': current_user['id']}, {'_id': 0})
    if not stored or not verify_password(payload.current_password, stored['password_hash']):
        raise HTTPException(status_code=400, detail='كلمة المرور الحالية غير صحيحة')

    # Employees must provide an owner verification code
    if current_user.get('role') == 'employee':
        code = (payload.verification_code or '').strip()
        if not code:
            raise HTTPException(status_code=400, detail='مطلوب رمز موافقة المالك')
        parent = current_user.get('parent_owner_id')
        if not parent:
            raise HTTPException(status_code=400, detail='حساب موظف غير مربوط بمالك')
        entry = await db.verification_codes.find_one(
            {
                'code': code,
                'owner_id': parent,
                'purpose': 'employee_pin_reset',
                'used_at': None,
            },
            {'_id': 0},
        )
        if not entry:
            raise HTTPException(status_code=400, detail='رمز موافقة المالك غير صحيح')
        if entry['expires_at'] < now_iso():
            raise HTTPException(status_code=400, detail='رمز موافقة المالك منتهي الصلاحية')
        await db.verification_codes.update_one(
            {'id': entry['id']}, {'$set': {'used_at': now_iso()}}
        )

    await db.users.update_one(
        {'id': current_user['id']},
        {'$set': {'password_hash': hash_password(payload.new_password)}},
    )
    return {'ok': True}


# ---------- OWNER-GENERATED VERIFICATION CODE ----------
@api_router.post('/owner/verification-codes')
async def create_verification_code(current_user: CurrentOwner):
    if current_user.get('role') == 'super_admin':
        raise HTTPException(status_code=400, detail='المشرف لا يملك موظفين')
    # Invalidate any previous unused codes for this owner
    await db.verification_codes.update_many(
        {'owner_id': current_user['id'], 'purpose': 'employee_pin_reset', 'used_at': None},
        {'$set': {'used_at': now_iso()}},
    )
    code = gen_otp(6)
    expires_at = (datetime.now(timezone.utc) + timedelta(minutes=VERIFICATION_CODE_TTL_MIN)).isoformat()
    doc = {
        'id': str(uuid.uuid4()),
        'code': code,
        'owner_id': current_user['id'],
        'purpose': 'employee_pin_reset',
        'expires_at': expires_at,
        'used_at': None,
        'created_at': now_iso(),
    }
    await db.verification_codes.insert_one(doc.copy())
    return {
        'code': code,
        'expires_at': expires_at,
        'ttl_minutes': VERIFICATION_CODE_TTL_MIN,
    }


# ---------- FORGOT-PIN / SELF-SERVICE RESET ----------
@api_router.post('/auth/forgot-pin')
async def forgot_pin(payload: ForgotPinRequest):
    username = payload.username.lower().strip()
    user = await db.users.find_one({'username': username}, {'_id': 0})
    # Always return success to avoid user enumeration
    if not user or user.get('role') == 'employee':
        return {'ok': True, 'delivery': 'admin_relay'}
    # Invalidate previous unused reset codes
    await db.reset_codes.update_many(
        {'user_id': user['id'], 'used_at': None},
        {'$set': {'used_at': now_iso()}},
    )
    code = gen_otp(6)
    expires_at = (datetime.now(timezone.utc) + timedelta(minutes=VERIFICATION_CODE_TTL_MIN)).isoformat()
    doc = {
        'id': str(uuid.uuid4()),
        'code': code,
        'user_id': user['id'],
        'username': user['username'],
        'phone': user.get('phone'),
        'email': user.get('email'),
        'expires_at': expires_at,
        'used_at': None,
        'created_at': now_iso(),
    }
    await db.reset_codes.insert_one(doc.copy())
    return {
        'ok': True,
        'delivery': 'admin_relay',
        'ttl_minutes': VERIFICATION_CODE_TTL_MIN,
    }


@api_router.post('/auth/reset-pin')
async def reset_pin(payload: ResetPinRequest):
    if not payload.new_password or len(payload.new_password) < 4:
        raise HTTPException(status_code=400, detail='كلمة المرور الجديدة يجب أن تكون 4 أحرف على الأقل')
    username = payload.username.lower().strip()
    user = await db.users.find_one({'username': username}, {'_id': 0})
    if not user:
        raise HTTPException(status_code=400, detail='رمز التحقق غير صحيح')
    entry = await db.reset_codes.find_one(
        {'user_id': user['id'], 'code': payload.code.strip(), 'used_at': None},
        {'_id': 0},
    )
    if not entry:
        raise HTTPException(status_code=400, detail='رمز التحقق غير صحيح')
    if entry['expires_at'] < now_iso():
        raise HTTPException(status_code=400, detail='رمز التحقق منتهي الصلاحية')
    await db.reset_codes.update_one({'id': entry['id']}, {'$set': {'used_at': now_iso()}})
    await db.users.update_one(
        {'id': user['id']}, {'$set': {'password_hash': hash_password(payload.new_password)}}
    )
    return {'ok': True}


@api_router.get('/admin/reset-codes')
async def admin_list_reset_codes(current_user: CurrentSuperAdmin):
    cursor = db.reset_codes.find({'used_at': None}, {'_id': 0}).sort('created_at', -1)
    now = now_iso()
    results: List[dict] = []
    async for r in cursor:
        if r['expires_at'] < now:
            continue
        results.append(r)
    return results


# ---------- STORES ----------
@api_router.get('/stores', response_model=List[Store])
async def list_stores(current_user: CurrentUser):
    owner = root_owner_id(current_user)
    default = await ensure_default_store(owner)
    # Employees are locked to the owner's default store — they cannot see or
    # switch to any other store.
    if current_user.get('role') == 'employee':
        return [Store(**default)]
    cursor = db.stores.find({'owner_id': owner}, {'_id': 0}).sort('created_at', 1)
    return [Store(**s) async for s in cursor]


@api_router.post('/stores', response_model=Store)
async def create_store(payload: StoreCreate, current_user: CurrentOwner):
    if current_user.get('role') == 'super_admin':
        raise HTTPException(status_code=400, detail='المشرف لا يملك محلات')
    doc = {
        'id': str(uuid.uuid4()),
        'owner_id': current_user['id'],
        'name': payload.name.strip(),
        'icon': payload.icon or 'storefront',
        'created_at': now_iso(),
    }
    await db.stores.insert_one(doc.copy())
    return Store(**doc)


@api_router.put('/stores/{store_id}', response_model=Store)
async def update_store(store_id: str, payload: StoreUpdate, current_user: CurrentOwner):
    owner = root_owner_id(current_user)
    updates = {k: v for k, v in payload.dict().items() if v is not None}
    if updates:
        await db.stores.update_one({'id': store_id, 'owner_id': owner}, {'$set': updates})
    s = await db.stores.find_one({'id': store_id, 'owner_id': owner}, {'_id': 0})
    if not s:
        raise HTTPException(status_code=404, detail='المحل غير موجود')
    return Store(**s)


@api_router.delete('/stores/{store_id}')
async def delete_store(store_id: str, current_user: CurrentOwner):
    owner = root_owner_id(current_user)
    count = await db.stores.count_documents({'owner_id': owner})
    if count <= 1:
        raise HTTPException(status_code=400, detail='لا يمكن حذف المحل الوحيد')
    res = await db.stores.delete_one({'id': store_id, 'owner_id': owner})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail='المحل غير موجود')
    # Cascade delete customers + transactions belonging to this store
    await db.customers.delete_many({'store_id': store_id, 'owner_id': owner})
    await db.transactions.delete_many({'store_id': store_id, 'owner_id': owner})
    return {'ok': True}


# ---------- CUSTOMERS / SUPPLIERS ----------
@api_router.post('/customers', response_model=Customer)
async def create_customer(payload: CustomerCreate, current_user: CurrentUser):
    scope = root_owner_id(current_user)
    party_type = payload.party_type if payload.party_type in ('customer', 'supplier') else 'customer'
    store_id = await resolve_store_id(current_user, payload.store_id)
    customer_id = str(uuid.uuid4())
    now = now_iso()
    doc = {
        'id': customer_id,
        'owner_id': scope,
        'store_id': store_id,
        'party_type': party_type,
        'name': payload.name.strip(),
        'phone': payload.phone.strip(),
        'max_debt': payload.max_debt,
        'created_at': now,
    }
    await db.customers.insert_one(doc)
    return to_customer(doc, {'total_debt': 0.0, 'last_transaction_at': None})


@api_router.get('/customers', response_model=List[Customer])
async def list_customers(
    current_user: CurrentUser,
    search: Optional[str] = None,
    store_id: Optional[str] = None,
    party_type: Optional[str] = None,
):
    scope = root_owner_id(current_user)
    resolved_store = await resolve_store_id(current_user, store_id)
    query: dict = {'owner_id': scope, 'store_id': resolved_store}
    if party_type in ('customer', 'supplier'):
        query['party_type'] = party_type
    else:
        query['party_type'] = 'customer'
    if search:
        query['name'] = {'$regex': search, '$options': 'i'}
    cursor = db.customers.find(query, {'_id': 0}).sort('created_at', -1)
    results = []
    async for c in cursor:
        totals = await compute_customer_totals(c.get('id', ''), scope, resolved_store)
        results.append(to_customer(c, totals))
    return results


@api_router.get('/customers/summary')
async def customers_summary(
    current_user: CurrentOwner,
    store_id: Optional[str] = None,
    party_type: Optional[str] = None,
):
    scope = root_owner_id(current_user)
    resolved_store = await resolve_store_id(current_user, store_id)
    query: dict = {'owner_id': scope, 'store_id': resolved_store}
    if party_type in ('customer', 'supplier'):
        query['party_type'] = party_type
    cursor = db.transactions.find(query, {'_id': 0})
    total = 0.0
    async for t in cursor:
        if t['type'] == 'debt':
            total += float(t['amount'])
        else:
            total -= float(t['amount'])
    return {'total_debt': round(total, 2)}


@api_router.get('/customers/{customer_id}', response_model=Customer)
async def get_customer(customer_id: str, current_user: CurrentUser):
    scope = root_owner_id(current_user)
    c = await db.customers.find_one({'id': customer_id, 'owner_id': scope}, {'_id': 0})
    if not c:
        raise HTTPException(status_code=404, detail='الزبون غير موجود')
    # Migrate legacy record inline if needed
    if not c.get('store_id') or not c.get('party_type'):
        default = await ensure_default_store(scope)
        await db.customers.update_one(
            {'id': customer_id},
            {'$set': {
                'store_id': c.get('store_id') or default['id'],
                'party_type': c.get('party_type') or 'customer',
            }},
        )
        c = await db.customers.find_one({'id': customer_id, 'owner_id': scope}, {'_id': 0})
    totals = await compute_customer_totals(customer_id, scope, c.get('store_id', ''))
    return to_customer(c, totals)


@api_router.put('/customers/{customer_id}', response_model=Customer)
async def update_customer(customer_id: str, payload: CustomerUpdate, current_user: CurrentUser):
    scope = root_owner_id(current_user)
    updates = {k: v for k, v in payload.dict().items() if v is not None}
    if current_user.get('role') == 'employee':
        updates.pop('max_debt', None)
    if updates:
        await db.customers.update_one({'id': customer_id, 'owner_id': scope}, {'$set': updates})
    c = await db.customers.find_one({'id': customer_id, 'owner_id': scope}, {'_id': 0})
    if not c:
        raise HTTPException(status_code=404, detail='الزبون غير موجود')
    totals = await compute_customer_totals(customer_id, scope, c.get('store_id', ''))
    return to_customer(c, totals)


@api_router.delete('/customers/{customer_id}')
async def delete_customer(customer_id: str, current_user: CurrentOwner):
    scope = root_owner_id(current_user)
    c = await db.customers.find_one({'id': customer_id, 'owner_id': scope}, {'_id': 0})
    if not c:
        raise HTTPException(status_code=404, detail='الزبون غير موجود')
    await db.customers.delete_one({'id': customer_id, 'owner_id': scope})
    await db.transactions.delete_many({'customer_id': customer_id, 'owner_id': scope})
    return {'ok': True}


# ---------- TRANSACTIONS ----------
@api_router.post('/transactions', response_model=Transaction)
async def create_transaction(payload: TransactionCreate, current_user: CurrentUser):
    scope = root_owner_id(current_user)
    if payload.type not in ('debt', 'payment'):
        raise HTTPException(status_code=400, detail='نوع العملية غير صحيح')
    if payload.amount <= 0:
        raise HTTPException(status_code=400, detail='المبلغ يجب أن يكون أكبر من صفر')
    customer = await db.customers.find_one({'id': payload.customer_id, 'owner_id': scope}, {'_id': 0})
    if not customer:
        raise HTTPException(status_code=404, detail='الزبون غير موجود')
    tx_id = str(uuid.uuid4())
    now = now_iso()
    doc = {
        'id': tx_id,
        'customer_id': payload.customer_id,
        'owner_id': scope,
        'store_id': customer['store_id'],
        'party_type': customer.get('party_type', 'customer'),
        'author_id': current_user['id'],
        'type': payload.type,
        'amount': float(payload.amount),
        'notes': payload.notes,
        'receipt_image': payload.receipt_image,
        'created_at': now,
    }
    await db.transactions.insert_one(doc)
    return to_transaction(doc)


@api_router.get('/transactions/{customer_id}', response_model=List[Transaction])
async def list_transactions(customer_id: str, current_user: CurrentUser):
    scope = root_owner_id(current_user)
    cursor = db.transactions.find({'customer_id': customer_id, 'owner_id': scope}, {'_id': 0}).sort('created_at', -1)
    results: List[Transaction] = []
    async for t in cursor:
        results.append(to_transaction(t))
    return results


@api_router.delete('/transactions/{transaction_id}')
async def delete_transaction(transaction_id: str, current_user: CurrentOwner):
    scope = root_owner_id(current_user)
    res = await db.transactions.delete_one({'id': transaction_id, 'owner_id': scope})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail='العملية غير موجودة')
    return {'ok': True}


@api_router.put('/transactions/{transaction_id}', response_model=Transaction)
async def update_transaction(
    transaction_id: str,
    payload: TransactionUpdate,
    current_user: CurrentOwner,
):
    """Owner/super_admin can edit the amount and note of an existing
    transaction. Type and customer stay immutable so the audit trail is
    preserved."""
    scope = root_owner_id(current_user)
    tx = await db.transactions.find_one({'id': transaction_id, 'owner_id': scope}, {'_id': 0})
    if not tx:
        raise HTTPException(status_code=404, detail='العملية غير موجودة')
    updates: dict = {}
    if payload.amount is not None:
        try:
            amt = float(payload.amount)
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail='المبلغ غير صالح')
        if amt <= 0:
            raise HTTPException(status_code=400, detail='المبلغ يجب أن يكون أكبر من صفر')
        updates['amount'] = amt
    if payload.notes is not None:
        cleaned = payload.notes.strip()
        updates['notes'] = cleaned or None
    if not updates:
        raise HTTPException(status_code=400, detail='لا توجد تغييرات')
    await db.transactions.update_one({'id': transaction_id, 'owner_id': scope}, {'$set': updates})
    tx = await db.transactions.find_one({'id': transaction_id, 'owner_id': scope}, {'_id': 0})
    return to_transaction(tx)


# ---------- SETTINGS ----------
async def get_settings_doc(owner_id: str) -> dict:
    doc = await db.settings.find_one({'owner_id': owner_id}, {'_id': 0})
    if not doc:
        defaults = Settings().dict()
        doc = {'owner_id': owner_id, **defaults}
        await db.settings.insert_one(doc.copy())
    return doc


@api_router.get('/settings', response_model=Settings)
async def get_settings(current_user: CurrentUser):
    scope = root_owner_id(current_user)
    doc = await get_settings_doc(scope)
    return Settings(**{k: doc[k] for k in Settings().dict().keys() if k in doc})


@api_router.put('/settings', response_model=Settings)
async def update_settings(payload: SettingsUpdate, current_user: CurrentOwner):
    scope = root_owner_id(current_user)
    updates = {k: v for k, v in payload.dict().items() if v is not None}
    if updates:
        await db.settings.update_one({'owner_id': scope}, {'$set': updates}, upsert=True)
    doc = await get_settings_doc(scope)
    return Settings(**{k: doc[k] for k in Settings().dict().keys() if k in doc})


# ---------- STAFF ----------
@api_router.get('/staff', response_model=List[UserPublic])
async def list_staff(current_user: CurrentOwner):
    if current_user.get('role') == 'super_admin':
        return []
    cursor = db.users.find({'parent_owner_id': current_user['id'], 'role': 'employee'}, {'_id': 0})
    results: List[UserPublic] = []
    async for u in cursor:
        results.append(await to_user_public_effective(u))
    return results


@api_router.post('/staff', response_model=UserPublic)
async def create_staff(payload: StaffCreate, current_user: CurrentOwner):
    if current_user.get('role') == 'super_admin':
        raise HTTPException(status_code=400, detail='المشرف لا يملك موظفين')
    username = payload.username.lower().strip()
    existing = await db.users.find_one({'username': username})
    if existing:
        raise HTTPException(status_code=400, detail='اسم المستخدم مستخدم بالفعل')
    user_id = str(uuid.uuid4())
    doc = {
        'id': user_id,
        'username': username,
        'password_hash': hash_password(payload.password),
        'shop_name': payload.display_name,
        'phone': None,
        'email': None,
        'role': 'employee',
        'is_active': True,
        'parent_owner_id': current_user['id'],
        'created_at': now_iso(),
    }
    await db.users.insert_one(doc)
    return await to_user_public_effective(doc)


@api_router.put('/staff/{staff_id}', response_model=UserPublic)
async def update_staff(staff_id: str, payload: StaffUpdate, current_user: CurrentOwner):
    staff = await db.users.find_one(
        {'id': staff_id, 'parent_owner_id': current_user['id'], 'role': 'employee'}, {'_id': 0}
    )
    if not staff:
        raise HTTPException(status_code=404, detail='الموظف غير موجود')
    updates: dict = {}
    if payload.password:
        updates['password_hash'] = hash_password(payload.password)
    if payload.display_name is not None:
        updates['shop_name'] = payload.display_name
    if payload.is_active is not None:
        updates['is_active'] = bool(payload.is_active)
    if updates:
        await db.users.update_one({'id': staff_id}, {'$set': updates})
    staff = await db.users.find_one({'id': staff_id}, {'_id': 0})
    return await to_user_public_effective(staff)


@api_router.delete('/staff/{staff_id}')
async def delete_staff(staff_id: str, current_user: CurrentOwner):
    res = await db.users.delete_one(
        {'id': staff_id, 'parent_owner_id': current_user['id'], 'role': 'employee'}
    )
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail='الموظف غير موجود')
    return {'ok': True}


# ---------- ADMIN ----------
@api_router.get('/admin/config', response_model=PublicConfig)
async def admin_get_config(current_user: CurrentSuperAdmin):
    cfg = await get_app_config()
    return PublicConfig(
        admin_phone=cfg.get('admin_phone', ADMIN_PHONE),
        admin_whatsapp=cfg.get('admin_whatsapp', ADMIN_WHATSAPP),
        subscription_price=float(cfg.get('subscription_price', SUBSCRIPTION_PRICE)),
        free_tier_limit=int(cfg.get('free_tier_limit', FREE_TIER_LIMIT)),
    )


@api_router.put('/admin/config', response_model=PublicConfig)
async def admin_update_config(payload: AdminConfigUpdate, current_user: CurrentSuperAdmin):
    """Update the global app config. Any field left None is not touched."""
    updates: dict = {}
    if payload.subscription_price is not None:
        try:
            price = float(payload.subscription_price)
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail='قيمة الاشتراك غير صالحة')
        if price < 0:
            raise HTTPException(status_code=400, detail='قيمة الاشتراك يجب ألا تكون سالبة')
        updates['subscription_price'] = price
    if payload.free_tier_limit is not None:
        try:
            limit = int(payload.free_tier_limit)
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail='الحد المجاني غير صالح')
        if limit < 1:
            raise HTTPException(status_code=400, detail='الحد المجاني يجب أن يكون 1 على الأقل')
        if limit > 100000:
            raise HTTPException(status_code=400, detail='الحد المجاني كبير جداً')
        updates['free_tier_limit'] = limit
    if payload.admin_phone is not None:
        updates['admin_phone'] = payload.admin_phone.strip()
    if payload.admin_whatsapp is not None:
        updates['admin_whatsapp'] = payload.admin_whatsapp.strip()
    if not updates:
        raise HTTPException(status_code=400, detail='لا توجد تغييرات')
    updates['updated_at'] = datetime.now(timezone.utc).isoformat()
    # Ensure doc exists (get_app_config will insert defaults if missing).
    await get_app_config()
    await db.app_config.update_one({'id': APP_CONFIG_ID}, {'$set': updates})
    cfg = await get_app_config()
    return PublicConfig(
        admin_phone=cfg.get('admin_phone', ADMIN_PHONE),
        admin_whatsapp=cfg.get('admin_whatsapp', ADMIN_WHATSAPP),
        subscription_price=float(cfg.get('subscription_price', SUBSCRIPTION_PRICE)),
        free_tier_limit=int(cfg.get('free_tier_limit', FREE_TIER_LIMIT)),
    )


@api_router.get('/admin/users', response_model=List[UserPublic])
async def admin_list_users(current_user: CurrentSuperAdmin):
    query = {
        '$or': [
            {'role': {'$in': ['owner', 'employee']}},
            {'role': {'$exists': False}},
        ]
    }
    cursor = db.users.find(query, {'_id': 0}).sort('created_at', -1)
    results: List[UserPublic] = []
    async for u in cursor:
        results.append(await to_user_public_effective(u))
    return results


@api_router.put('/admin/users/{user_id}/activate', response_model=UserPublic)
async def admin_activate(user_id: str, current_user: CurrentSuperAdmin):
    """Grant a fresh 30-day subscription starting now (also re-enables physical
    is_active in case it was toggled off)."""
    expires_at = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
    res = await db.users.update_one(
        {'id': user_id},
        {'$set': {'is_active': True, 'subscription_expires_at': expires_at}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail='المستخدم غير موجود')
    u = await db.users.find_one({'id': user_id}, {'_id': 0})
    return await to_user_public_effective(u)


@api_router.put('/admin/users/{user_id}/extend', response_model=UserPublic)
async def admin_extend(user_id: str, payload: ExtendSubscriptionRequest, current_user: CurrentSuperAdmin):
    """Extend an existing subscription by N days. Adds on top of the current
    expiry when the subscription is still active; otherwise starts from now."""
    days = max(1, min(int(payload.days or 30), 365))
    u = await db.users.find_one({'id': user_id}, {'_id': 0})
    if not u:
        raise HTTPException(status_code=404, detail='المستخدم غير موجود')
    now = datetime.now(timezone.utc)
    current_exp = u.get('subscription_expires_at')
    base = now
    if current_exp:
        try:
            parsed = datetime.fromisoformat(current_exp)
            if parsed > now:
                base = parsed
        except Exception:
            base = now
    new_exp = (base + timedelta(days=days)).isoformat()
    await db.users.update_one(
        {'id': user_id},
        {'$set': {'is_active': True, 'subscription_expires_at': new_exp}},
    )
    u = await db.users.find_one({'id': user_id}, {'_id': 0})
    return await to_user_public_effective(u)


@api_router.put('/admin/users/{user_id}/deactivate', response_model=UserPublic)
async def admin_deactivate(user_id: str, current_user: CurrentSuperAdmin):
    """Clear the subscription. The account remains physically active but any
    owner that has hit the free-tier limit will now see the lock screen."""
    res = await db.users.update_one(
        {'id': user_id},
        {'$set': {'is_active': False, 'subscription_expires_at': None}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail='المستخدم غير موجود')
    u = await db.users.find_one({'id': user_id}, {'_id': 0})
    return await to_user_public_effective(u)


@api_router.put('/admin/users/{user_id}/reset-password', response_model=UserPublic)
async def admin_reset_password(user_id: str, payload: ResetPasswordRequest, current_user: CurrentSuperAdmin):
    if not payload.new_password or len(payload.new_password) < 4:
        raise HTTPException(status_code=400, detail='كلمة المرور يجب أن تكون 4 أحرف على الأقل')
    res = await db.users.update_one(
        {'id': user_id}, {'$set': {'password_hash': hash_password(payload.new_password)}}
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail='المستخدم غير موجود')
    u = await db.users.find_one({'id': user_id}, {'_id': 0})
    return await to_user_public_effective(u)


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=['*'],
    allow_methods=['*'],
    allow_headers=['*'],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


@app.on_event('startup')
async def migrate_data():
    # Backfill store_id + party_type on legacy customers/transactions
    cursor = db.customers.find({'store_id': {'$exists': False}}, {'_id': 0, 'id': 1, 'owner_id': 1})
    async for c in cursor:
        default = await ensure_default_store(c['owner_id'])
        await db.customers.update_one(
            {'id': c['id']},
            {'$set': {'store_id': default['id'], 'party_type': 'customer'}},
        )
    cursor = db.customers.find({'party_type': {'$exists': False}}, {'_id': 0, 'id': 1})
    async for c in cursor:
        await db.customers.update_one({'id': c['id']}, {'$set': {'party_type': 'customer'}})
    cursor = db.transactions.find({'store_id': {'$exists': False}}, {'_id': 0, 'id': 1, 'customer_id': 1})
    async for t in cursor:
        cust = await db.customers.find_one({'id': t['customer_id']}, {'_id': 0})
        if cust:
            await db.transactions.update_one(
                {'id': t['id']},
                {'$set': {
                    'store_id': cust.get('store_id', ''),
                    'party_type': cust.get('party_type', 'customer'),
                }},
            )


@app.on_event('shutdown')
async def shutdown_db_client():
    client.close()
    
@app.get("/")
async def serve_index():
    possible_paths = [
        os.path.join(ROOT_DIR, "frontend", "dist", "index.html"),
        os.path.join(ROOT_DIR, "frontend", "web-build", "index.html"),
        os.path.join(ROOT_DIR, "frontend", "public", "index.html"),
        os.path.join(ROOT_DIR, "frontend", "index.html"),
    ]
    for path in possible_paths:
        if os.path.exists(path):
            return FileResponse(path)
            
    return JSONResponse(
        status_code=200,
        content={
            "status": "Daftari API is Running Successfully!",
            "message": "Backend connected. Waiting for frontend build."
        }
    )
