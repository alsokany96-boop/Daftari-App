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

pwd_context = CryptContext(schemes=['bcrypt'], deprecated='auto')
oauth2_scheme = OAuth2PasswordBearer(tokenUrl='/api/auth/login')

app = FastAPI()
api_router = APIRouter(prefix='/api')


# =============== MODELS =================
class UserRegister(BaseModel):
    username: str
    password: str
    shop_name: Optional[str] = None


class UserLogin(BaseModel):
    username: str
    password: str


class UserPublic(BaseModel):
    id: str
    username: str
    shop_name: Optional[str] = None


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
    receipt_image: Optional[str] = None  # base64


class Transaction(BaseModel):
    id: str
    customer_id: str
    owner_id: str
    type: str
    amount: float
    notes: Optional[str] = None
    receipt_image: Optional[str] = None
    created_at: str


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


CurrentUser = Annotated[dict, Depends(get_current_user)]


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


@api_router.post('/auth/register', response_model=Token)
async def register(payload: UserRegister):
    existing = await db.users.find_one({'username': payload.username.lower().strip()})
    if existing:
        raise HTTPException(status_code=400, detail='اسم المستخدم مستخدم بالفعل')
    user_id = str(uuid.uuid4())
    user_doc = {
        'id': user_id,
        'username': payload.username.lower().strip(),
        'password_hash': hash_password(payload.password),
        'shop_name': payload.shop_name,
        'created_at': datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(user_doc)
    token = create_access_token({'sub': user_id})
    return Token(
        access_token=token,
        token_type='bearer',
        user=UserPublic(id=user_id, username=user_doc['username'], shop_name=user_doc.get('shop_name')),
    )


@api_router.post('/auth/login', response_model=Token)
async def login(payload: UserLogin):
    user = await db.users.find_one({'username': payload.username.lower().strip()}, {'_id': 0})
    if not user or not verify_password(payload.password, user['password_hash']):
        raise HTTPException(status_code=401, detail='اسم المستخدم أو كلمة المرور غير صحيحة')
    token = create_access_token({'sub': user['id']})
    return Token(
        access_token=token,
        token_type='bearer',
        user=UserPublic(id=user['id'], username=user['username'], shop_name=user.get('shop_name')),
    )


@api_router.get('/auth/me', response_model=UserPublic)
async def me(current_user: CurrentUser):
    return UserPublic(id=current_user['id'], username=current_user['username'], shop_name=current_user.get('shop_name'))


# ========== CUSTOMERS ==========
@api_router.post('/customers', response_model=Customer)
async def create_customer(payload: CustomerCreate, current_user: CurrentUser):
    customer_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        'id': customer_id,
        'owner_id': current_user['id'],
        'name': payload.name.strip(),
        'phone': payload.phone.strip(),
        'max_debt': payload.max_debt,
        'created_at': now,
    }
    await db.customers.insert_one(doc)
    return Customer(**doc, total_debt=0.0, last_transaction_at=None)


@api_router.get('/customers', response_model=List[Customer])
async def list_customers(current_user: CurrentUser, search: Optional[str] = None):
    query = {'owner_id': current_user['id']}
    if search:
        query['name'] = {'$regex': search, '$options': 'i'}
    cursor = db.customers.find(query, {'_id': 0}).sort('created_at', -1)
    results = []
    async for c in cursor:
        totals = await compute_customer_totals(c['id'], current_user['id'])
        results.append(Customer(**c, **totals))
    return results


@api_router.get('/customers/summary')
async def customers_summary(current_user: CurrentUser):
    cursor = db.transactions.find({'owner_id': current_user['id']}, {'_id': 0})
    total = 0.0
    async for t in cursor:
        if t['type'] == 'debt':
            total += float(t['amount'])
        else:
            total -= float(t['amount'])
    return {'total_debt': round(total, 2)}


@api_router.get('/customers/{customer_id}', response_model=Customer)
async def get_customer(customer_id: str, current_user: CurrentUser):
    c = await db.customers.find_one({'id': customer_id, 'owner_id': current_user['id']}, {'_id': 0})
    if not c:
        raise HTTPException(status_code=404, detail='الزبون غير موجود')
    totals = await compute_customer_totals(customer_id, current_user['id'])
    return Customer(**c, **totals)


@api_router.put('/customers/{customer_id}', response_model=Customer)
async def update_customer(customer_id: str, payload: CustomerUpdate, current_user: CurrentUser):
    updates = {k: v for k, v in payload.dict().items() if v is not None}
    if updates:
        await db.customers.update_one(
            {'id': customer_id, 'owner_id': current_user['id']}, {'$set': updates}
        )
    c = await db.customers.find_one({'id': customer_id, 'owner_id': current_user['id']}, {'_id': 0})
    if not c:
        raise HTTPException(status_code=404, detail='الزبون غير موجود')
    totals = await compute_customer_totals(customer_id, current_user['id'])
    return Customer(**c, **totals)


@api_router.delete('/customers/{customer_id}')
async def delete_customer(customer_id: str, current_user: CurrentUser):
    res = await db.customers.delete_one({'id': customer_id, 'owner_id': current_user['id']})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail='الزبون غير موجود')
    await db.transactions.delete_many({'customer_id': customer_id, 'owner_id': current_user['id']})
    return {'ok': True}


# ========== TRANSACTIONS ==========
@api_router.post('/transactions', response_model=Transaction)
async def create_transaction(payload: TransactionCreate, current_user: CurrentUser):
    if payload.type not in ('debt', 'payment'):
        raise HTTPException(status_code=400, detail='نوع العملية غير صحيح')
    if payload.amount <= 0:
        raise HTTPException(status_code=400, detail='المبلغ يجب أن يكون أكبر من صفر')
    customer = await db.customers.find_one({'id': payload.customer_id, 'owner_id': current_user['id']}, {'_id': 0})
    if not customer:
        raise HTTPException(status_code=404, detail='الزبون غير موجود')
    tx_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        'id': tx_id,
        'customer_id': payload.customer_id,
        'owner_id': current_user['id'],
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
    cursor = db.transactions.find(
        {'customer_id': customer_id, 'owner_id': current_user['id']}, {'_id': 0}
    ).sort('created_at', -1)
    return [Transaction(**t) async for t in cursor]


@api_router.delete('/transactions/{transaction_id}')
async def delete_transaction(transaction_id: str, current_user: CurrentUser):
    res = await db.transactions.delete_one({'id': transaction_id, 'owner_id': current_user['id']})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail='العملية غير موجودة')
    return {'ok': True}


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
