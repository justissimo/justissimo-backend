
import { prisma } from "../../database";
import { DomainError, LawyerNotFoundError } from "../../errors";
import { DivulgationNotFoundError } from "../../errors/divulgation-not-found-error";
import { NonEmptyString } from "../../validators";

interface IListMessagesDivulgationRequest {
    id_divulgation: string;
    fk_lawyer: string;
}

class ListMessagesDivulgationLawyerUseCase {
    async execute(listMessagesRequest: IListMessagesDivulgationRequest) {
        const id_divulgation = NonEmptyString.validate("id_divulgation", listMessagesRequest.id_divulgation).value;
        const fk_lawyer = NonEmptyString.validate("fk_lawyer", listMessagesRequest.fk_lawyer).value;

        if (Number.parseInt(id_divulgation) <= 0) {
            throw new DomainError("Id da divulgacao invalido!");
        }
        
        if (Number.parseInt(fk_lawyer) <= 0) {
            throw new DomainError("Id do advogado invalido!");
        }

        const lawyer = await prisma.advogado.findUnique({
            where: {
                id_advogado: Number.parseInt(fk_lawyer)
            }
        });

        if (!lawyer) {
            throw new LawyerNotFoundError();
        }

        const listDivulgationsWithMessages = await prisma.divulgacao.findFirst({
            where: {
                id_divulgacao: Number.parseInt(id_divulgation),
            },
            select: {
                id_divulgacao: true,
                titulo: true,
                descricao: true,
                dt_cadastro: true,
                encerrado: true,
                cliente: {
                    select: {
                        nome: true,
                        endereco: {
                            select: {
                                cidade: true,
                                estado: true
                            }
                        },
                        usuario: {
                            select: {
                                url_foto_perfil: true
                            }
                        }
                    }
                },
                mensagens: {
                    select: {
                        id_mensagem_divulgacao: true,
                        mensagem: true,
                        dt_mensagem: true,
                        advogado: {
                            select: {
                                id_advogado: true,
                                nome: true,
                            }
                        },
                    },
                    where: {
                        fk_advogado: Number.parseInt(fk_lawyer)
                    },
                    orderBy: {
                        dt_mensagem: "desc"
                    }
                }
            }
        });

        if (listDivulgationsWithMessages == null) {
            throw new DivulgationNotFoundError();
        }

        return listDivulgationsWithMessages;
    }
}

export { ListMessagesDivulgationLawyerUseCase }