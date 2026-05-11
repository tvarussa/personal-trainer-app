import os
from sqlalchemy import create_engine, Column, Integer, String, Boolean, Float, DateTime, ForeignKey, Enum
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from datetime import datetime
import enum

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./personal_trainer.db")

# Supabase e alguns providers usam "postgres://"; SQLAlchemy requer "postgresql://"
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

if DATABASE_URL.startswith("sqlite"):
    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
else:
    engine = create_engine(
        DATABASE_URL,
        pool_pre_ping=True,
        connect_args={"options": "-c statement_timeout=30000"},
    )
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


class PerfilEnum(str, enum.Enum):
    personal = "personal"
    aluno = "aluno"


class StatusAgendamento(str, enum.Enum):
    confirmado = "confirmado"
    cancelado = "cancelado"
    realizado = "realizado"


class TipoAgendamento(str, enum.Enum):
    recorrente = "recorrente"
    avulso = "avulso"


class FrequenciaRecorrencia(str, enum.Enum):
    semanal = "semanal"
    mensal = "mensal"


class Usuario(Base):
    __tablename__ = "usuarios"

    id = Column(Integer, primary_key=True, index=True)
    nome = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    senha_hash = Column(String, nullable=False)
    telefone = Column(String)
    perfil = Column(Enum(PerfilEnum), nullable=False)
    ativo = Column(Boolean, default=True)

    aluno = relationship("Aluno", back_populates="usuario", uselist=False)
    notificacoes = relationship("Notificacao", back_populates="destinatario")


class Academia(Base):
    __tablename__ = "academias"

    id = Column(Integer, primary_key=True, index=True)
    nome = Column(String, nullable=False)
    endereco = Column(String, nullable=True)
    ativo = Column(Boolean, default=True)

    alunos = relationship("Aluno", back_populates="academia")


class Aluno(Base):
    __tablename__ = "alunos"

    id = Column(Integer, primary_key=True, index=True)
    usuario_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    academia_id = Column(Integer, ForeignKey("academias.id"), nullable=True)
    preco_por_aula = Column(Float, default=0.0)
    taxa_mensal = Column(Float, default=0.0)
    observacoes = Column(String)

    usuario = relationship("Usuario", back_populates="aluno")
    academia = relationship("Academia", back_populates="alunos")
    agendamentos = relationship("Agendamento", back_populates="aluno")
    recorrencias = relationship("Recorrencia", back_populates="aluno")
    financeiros = relationship("Financeiro", back_populates="aluno")


class SlotDisponivel(Base):
    __tablename__ = "slots_disponiveis"

    id = Column(Integer, primary_key=True, index=True)
    data_hora = Column(DateTime, nullable=False, index=True)
    disponivel = Column(Boolean, default=True)
    bloqueado_pelo_personal = Column(Boolean, default=False)

    agendamento = relationship("Agendamento", back_populates="slot", uselist=False)


class Agendamento(Base):
    __tablename__ = "agendamentos"

    id = Column(Integer, primary_key=True, index=True)
    aluno_id = Column(Integer, ForeignKey("alunos.id"), nullable=False)
    slot_id = Column(Integer, ForeignKey("slots_disponiveis.id"), nullable=False)
    tipo = Column(Enum(TipoAgendamento), nullable=False)
    status = Column(Enum(StatusAgendamento), default=StatusAgendamento.confirmado)
    cancelado_com_antecedencia = Column(Boolean, default=False)
    cobrado = Column(Boolean, default=False)
    nao_cobrar = Column(Boolean, default=False)
    criado_em = Column(DateTime, default=datetime.utcnow)

    aluno = relationship("Aluno", back_populates="agendamentos")
    slot = relationship("SlotDisponivel", back_populates="agendamento")


class Recorrencia(Base):
    __tablename__ = "recorrencias"

    id = Column(Integer, primary_key=True, index=True)
    aluno_id = Column(Integer, ForeignKey("alunos.id"), nullable=False)
    dia_semana = Column(Integer, nullable=False)  # 0=segunda ... 6=domingo
    horario = Column(String, nullable=False)  # "HH:MM"
    frequencia = Column(Enum(FrequenciaRecorrencia), default=FrequenciaRecorrencia.semanal)
    ativo = Column(Boolean, default=True)

    aluno = relationship("Aluno", back_populates="recorrencias")


class Financeiro(Base):
    __tablename__ = "financeiro"

    id = Column(Integer, primary_key=True, index=True)
    aluno_id = Column(Integer, ForeignKey("alunos.id"), nullable=False)
    mes_referencia = Column(String, nullable=False)  # "YYYY-MM"
    quantidade_aulas = Column(Integer, default=0)
    valor_aulas = Column(Float, default=0.0)
    taxa_mensal = Column(Float, default=0.0)
    total = Column(Float, default=0.0)
    pago = Column(Boolean, default=False)

    aluno = relationship("Aluno", back_populates="financeiros")


class Notificacao(Base):
    __tablename__ = "notificacoes"

    id = Column(Integer, primary_key=True, index=True)
    destinatario_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    mensagem = Column(String, nullable=False)
    lida = Column(Boolean, default=False)
    criada_em = Column(DateTime, default=datetime.utcnow)

    destinatario = relationship("Usuario", back_populates="notificacoes")


class BackupLog(Base):
    __tablename__ = "backup_log"

    id = Column(Integer, primary_key=True, index=True)
    arquivo = Column(String, nullable=False)
    criado_em = Column(DateTime, default=datetime.utcnow)
    restaurado_em = Column(DateTime)


class Bloqueio(Base):
    __tablename__ = "bloqueios"

    id = Column(Integer, primary_key=True, index=True)
    # data preenchida → bloqueio pontual; dia_semana preenchido → recorrente semanal
    data = Column(String, nullable=True, index=True)        # "YYYY-MM-DD"
    dia_semana = Column(Integer, nullable=True)              # 0=segunda … 6=domingo
    hora_inicio = Column(String, nullable=True)              # "HH:MM"; None = dia todo
    hora_fim = Column(String, nullable=True)                 # "HH:MM"; None = dia todo
    motivo = Column(String, nullable=True)
    ativo = Column(Boolean, default=True)
    criado_em = Column(DateTime, default=datetime.utcnow)


class OcorrenciaCancelada(Base):
    __tablename__ = "ocorrencias_canceladas"

    id = Column(Integer, primary_key=True, index=True)
    recorrencia_id = Column(Integer, ForeignKey("recorrencias.id"), nullable=False)
    data = Column(String, nullable=False)  # "YYYY-MM-DD"
    cancelado_em = Column(DateTime, default=datetime.utcnow)


class OcorrenciaGratuita(Base):
    """Marca uma ocorrência de aula recorrente como não cobrada."""
    __tablename__ = "ocorrencias_gratuitas"

    id = Column(Integer, primary_key=True, index=True)
    recorrencia_id = Column(Integer, ForeignKey("recorrencias.id"), nullable=False)
    data = Column(String, nullable=False)  # "YYYY-MM-DD"
    criado_em = Column(DateTime, default=datetime.utcnow)


def criar_tabelas():
    Base.metadata.create_all(bind=engine)
