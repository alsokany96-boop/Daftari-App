from fastapi import FastAPI, APIRouter, HTTPException, Depends, status
from fastapi.security import OAuth2PasswordBearer
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Annotated
import uuid
from datetime import datetime, timedelta, timezone
from jose import JWTError, jwt
from passlib.context import CryptContext


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# JWT config
SECRET_KEY = os.environ.get('JWT_SECRET_KEY', 'daftari-super-secret-change-in-prod-xyz-123')
ALGORITHM = 'HS256'
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 30  # 30 days

# Business config
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


class UserLogin(BaseModel):
    username: str
    password: str


class UserPublic(BaseModel):
    id: str
    username: str
    shop_name: Optional[str] = None
    phone: Optional[str] = None
    role: str  # 'super_admin' | 'owner' | 'employee'
    is_active: bool
    parent_owner_id: Optional[str] = None
    created_at: Optional[str] = None


class Token(BaseModel):
    access_token: str
    token_type: str
    user: UserPublic


class CustomerCreate(BaseModel):
    name: str
    phone: str
    max_debt: Optional[float] = None


class CustomerUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    max_debt: Optional[float] = None


class Customer(BaseModel):
    id: str
    owner_id: str
    name: str
    phone: str
    max_debt: Optional[float] = None
    created_at: str
    total_debt: float = 0.0
    last_transaction_at: Optional[str] = None


class TransactionCreate(BaseModel):
    customer_id: str
    type: str  # 'debt' or 'payment'
    amount: float
    notes: Optional[str] = None
    receipt_image: Optional[str] = None


class Transaction(BaseModel):
    id: str
    customer_id: str
    owner_id: str
    author_id: str
    type: str
    amount: float
    notes: Optional[str] = None
    receipt_image: Optional[str] = None
    created_at: str


class Settings(BaseModel):
    reminder_enabled: bool = True
    reminder_frequency: str = 'weekly'  # daily | weekly | monthly | custom
    reminder_custom_days: int = 7
    reminder_template: str = 'مرحباً {name}، نود تذكيرك بأن حسابك الحالي في {shop} هو {amount} {currency}. نسعد بزيارتك.'


class SettingsUpdate(BaseModel):
    reminder_enabled: Optional[bool] = None
    reminder_frequency: Optional[str] = None
    reminder_custom_days: Optional[int] = None
    reminder_template: Optional[str] = None


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


class PublicConfig(BaseModel):
    admin_phone: str
    admin_whatsapp: str
    subscription_price: float
    free_tier_limit: int


# =============== HELPERS =================
def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({'exp': expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def to_user_public(u: dict) -> UserPublic:
    return UserPublic(
        id=u['id'],
        username=u['username'],
        shop_name=u.get('shop_name'),
        phone=u.get('phone'),
        role=u.get('role', 'owner'),
        is_active=bool(u.get('is_active', True)),
        parent_owner_id=u.get('parent_owner_id'),
        created_at=u.get('created_at'),
    )


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
    if not current_user.get('is_active', True):
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
    """Returns the root owner id for scoping customers/transactions.
    Owners scope to themselves; employees scope to their parent owner."""
    if user.get('role') == 'employee' and user.get('parent_owner_id'):
        return user['parent_owner_id']
    return user['id']


async def compute_customer_totals(customer_id: str, owner_id: str) -> dict:
    cursor = db.transactions.find({'customer_id': customer_id, 'owner_id': owner_id}, {'_id': 0})
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
    return PublicConfig(
        admin_phone=ADMIN_PHONE,
        admin_whatsapp=ADMIN_WHATSAPP,
        subscription_price=SUBSCRIPTION_PRICE,
        free_tier_limit=FREE_TIER_LIMIT,
    )


# ---------- AUTH ----------
@api_router.post('/auth/register', response_model=Token)
async def register(payload: UserRegister):
    username = payload.username.lower().strip()
    existing = await db.users.find_one({'username': username})
    if existing:
        raise HTTPException(status_code=400, detail='اسم المستخدم مستخدم بالفعل')

    # Determine role and active status
    if username == SUPER_ADMIN_USERNAME:
        role = 'super_admin'
        is_active = True
    else:
        role = 'owner'
        owner_count = await db.users.count_documents({'role': 'owner'})
        is_active = owner_count < FREE_TIER_LIMIT

    user_id = str(uuid.uuid4())
    user_doc = {
        'id': user_id,
        'username': username,
        'password_hash': hash_password(payload.password),
        'shop_name': payload.shop_name,
        'phone': payload.phone,
        'role': role,
        'is_active': is_active,
        'parent_owner_id': None,
        'created_at': datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(user_doc)
    token = create_access_token({'sub': user_id})
    return Token(access_token=token, token_type='bearer', user=to_user_public(user_doc))


@api_router.post('/auth/login', response_model=Token)
async def login(payload: UserLogin):
    user = await db.users.find_one({'username': payload.username.lower().strip()}, {'_id': 0})
    if not user or not verify_password(payload.password, user['password_hash']):
        raise HTTPException(status_code=401, detail='اسم المستخدم أو كلمة المرور غير صحيحة')
    token = create_access_token({'sub': user['id']})
    return Token(access_token=token, token_type='bearer', user=to_user_public(user))


@api_router.get('/auth/me', response_model=UserPublic)
async def me(current_user: Annotated[dict, Depends(get_current_user)]):
    return to_user_public(current_user)


# ---------- CUSTOMERS ----------
@api_router.post('/customers', response_model=Customer)
async def create_customer(payload: CustomerCreate, current_user: CurrentUser):
    scope = root_owner_id(current_user)
    customer_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        'id': customer_id,
        'owner_id': scope,
        'name': payload.name.strip(),
        'phone': payload.phone.strip(),
        'max_debt': payload.max_debt,
        'created_at': now,
    }
    await db.customers.insert_one(doc)
    return Customer(**doc, total_debt=0.0, last_transaction_at=None)


@api_router.get('/customers', response_model=List[Customer])
async def list_customers(current_user: CurrentUser, search: Optional[str] = None):
    scope = root_owner_id(current_user)
    query = {'owner_id': scope}
    if search:
        query['name'] = {'$regex': search, '$options': 'i'}
    cursor = db.customers.find(query, {'_id': 0}).sort('created_at', -1)
    results = []
    async for c in cursor:
        totals = await compute_customer_totals(c['id'], scope)
        results.append(Customer(**c, **totals))
    return results


@api_router.get('/customers/summary')
async def customers_summary(current_user: CurrentOwner):
    scope = root_owner_id(current_user)
    cursor = db.transactions.find({'owner_id': scope}, {'_id': 0})
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
    totals = await compute_customer_totals(customer_id, scope)
    return Customer(**c, **totals)


@api_router.put('/customers/{customer_id}', response_model=Customer)
async def update_customer(customer_id: str, payload: CustomerUpdate, current_user: CurrentUser):
    scope = root_owner_id(current_user)
    updates = {k: v for k, v in payload.dict().items() if v is not None}
    # Employees cannot change max_debt (financial), only name/phone.
    if current_user.get('role') == 'employee':
        updates.pop('max_debt', None)
    if updates:
        await db.customers.update_one({'id': customer_id, 'owner_id': scope}, {'$set': updates})
    c = await db.customers.find_one({'id': customer_id, 'owner_id': scope}, {'_id': 0})
    if not c:
        raise HTTPException(status_code=404, detail='الزبون غير موجود')
    totals = await compute_customer_totals(customer_id, scope)
    return Customer(**c, **totals)


@api_router.delete('/customers/{customer_id}')
async def delete_customer(customer_id: str, current_user: CurrentOwner):
    scope = root_owner_id(current_user)
    res = await db.customers.delete_one({'id': customer_id, 'owner_id': scope})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail='الزبون غير موجود')
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
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        'id': tx_id,
        'customer_id': payload.customer_id,
        'owner_id': scope,
        'author_id': current_user['id'],
        'type': payload.type,
        'amount': float(payload.amount),
        'notes': payload.notes,
        'receipt_image': payload.receipt_image,
        'created_at': now,
    }
    await db.transactions.insert_one(doc)
    return Transaction(**doc)


@api_router.get('/transactions/{customer_id}', response_model=List[Transaction])
async def list_transactions(customer_id: str, current_user: CurrentUser):
    scope = root_owner_id(current_user)
    cursor = db.transactions.find({'customer_id': customer_id, 'owner_id': scope}, {'_id': 0}).sort('created_at', -1)
    results: List[Transaction] = []
    async for t in cursor:
        # Backfill author_id for older records
        t.setdefault('author_id', t.get('owner_id', ''))
        results.append(Transaction(**t))
    return results


@api_router.delete('/transactions/{transaction_id}')
async def delete_transaction(transaction_id: str, current_user: CurrentOwner):
    scope = root_owner_id(current_user)
    res = await db.transactions.delete_one({'id': transaction_id, 'owner_id': scope})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail='العملية غير موجودة')
    return {'ok': True}


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


# ---------- STAFF (employees under an owner) ----------
@api_router.get('/staff', response_model=List[UserPublic])
async def list_staff(current_user: CurrentOwner):
    if current_user.get('role') == 'super_admin':
        return []
    cursor = db.users.find({'parent_owner_id': current_user['id'], 'role': 'employee'}, {'_id': 0})
    return [to_user_public(u) async for u in cursor]


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
        'role': 'employee',
        'is_active': True,
        'parent_owner_id': current_user['id'],
        'created_at': datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(doc)
    return to_user_public(doc)


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
    return to_user_public(staff)


@api_router.delete('/staff/{staff_id}')
async def delete_staff(staff_id: str, current_user: CurrentOwner):
    res = await db.users.delete_one(
        {'id': staff_id, 'parent_owner_id': current_user['id'], 'role': 'employee'}
    )
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail='الموظف غير موجود')
    return {'ok': True}


# ---------- ADMIN (super_admin only) ----------
@api_router.get('/admin/users', response_model=List[UserPublic])
async def admin_list_users(current_user: CurrentSuperAdmin):
    query = {
        '$or': [
            {'role': {'$in': ['owner', 'employee']}},
            {'role': {'$exists': False}},
        ]
    }
    cursor = db.users.find(query, {'_id': 0}).sort('created_at', -1)
    return [to_user_public(u) async for u in cursor]


@api_router.put('/admin/users/{user_id}/activate', response_model=UserPublic)
async def admin_activate(user_id: str, current_user: CurrentSuperAdmin):
    res = await db.users.update_one({'id': user_id}, {'$set': {'is_active': True}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail='المستخدم غير موجود')
    u = await db.users.find_one({'id': user_id}, {'_id': 0})
    return to_user_public(u)


@api_router.put('/admin/users/{user_id}/deactivate', response_model=UserPublic)
async def admin_deactivate(user_id: str, current_user: CurrentSuperAdmin):
    res = await db.users.update_one({'id': user_id}, {'$set': {'is_active': False}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail='المستخدم غير موجود')
    u = await db.users.find_one({'id': user_id}, {'_id': 0})
    return to_user_public(u)


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
    return to_user_public(u)


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


@app.on_event('shutdown')
async def shutdown_db_client():
    client.close()
