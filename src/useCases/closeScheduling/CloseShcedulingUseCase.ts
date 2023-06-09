import { prisma } from "../../database";
import { DomainError, LawyerNotFoundError, UserNotFoundError } from "../../errors";
import { SendMailSchedulingError } from "../../errors/send-email-scheduling-error";
import { mail } from "../../mail";
import { NonEmptyString } from "../../validators";

interface ICloseSchedulingRequest {
    id_scheduling: string;
    justification: string;
    reason: string;
    id_user: string;
}
class CloseSchedulingUseCase {
    async execute(closeSchedulingRequest: ICloseSchedulingRequest) {

        const reasons = ["Cancelamento", "Atendimento encerrado"];
        const id_scheduling = NonEmptyString.validate("id_scheduling", closeSchedulingRequest.id_scheduling).value;
        const justificativa = NonEmptyString.validate("justificativa", closeSchedulingRequest.justification).value;
        const reason = NonEmptyString.validate("reason", closeSchedulingRequest.reason).value;
        const id_user = NonEmptyString.validate("id_user", closeSchedulingRequest.id_user).value;

        if (!reasons.includes(reason)) {
            throw new DomainError("Motivo inválido, informado: " + reason + ". Motivos válidos: " + reasons);
        }

        if (Number.parseInt(id_scheduling) <= 0) {
            throw new DomainError("Id do agendamento invalido!");
        }

        if (Number.parseInt(id_user) <= 0) {
            throw new DomainError("Id do usuário invalido!");
        }

        if ((justificativa.length < 10) || (justificativa.length > 100)) {
            throw new DomainError("Justificativa invalida! A justificativa deve ter entre 10 e 100 caracteres.");
        }

        const userExists = await prisma.usuario.findUnique({
            where: {
                id_usuario: Number.parseInt(id_user)
            },
            include: {
                advogado: true,
                cliente: true
            }
        });

        if (!userExists) {
            throw new UserNotFoundError();
        }

        const schedulingExists = await prisma.agendamento.findFirst({
            where: {
                id_agenda: Number.parseInt(id_scheduling),
                encerrado: false
            },
            include: {
                cliente: {
                    select: {
                        nome: true,
                        usuario: {
                            select: {
                                email: true
                            }
                        }
                    }
                },
                advogado: {
                    select: {
                        nome: true,
                        usuario: {
                            select: {
                                email: true
                            }
                        }
                    }
                },
            },
        });

        if (!schedulingExists) {
            throw new DomainError('Não foi possível encerrar o agendamento pois o registro não existe ou já foi encerrado!');
        }

        const updateSheduling = prisma.agendamento.update({
            where: {
                id_agenda: Number.parseInt(id_scheduling),
            },
            data: {
                encerrado: true,
                justificativa: justificativa,
                data_encerramento: new Date(),
                motivo_encerramento: reason,
            }
        });

        const firstNameClient = schedulingExists.cliente?.nome.split(" ")[0];
        const firstNameLawyer = schedulingExists.advogado?.nome.split(" ")[0];
        try{
            if (reason === "Cancelamento") {
                if (userExists.advogado) {
                    await mail.sendEmail({
                        from: process.env.SMTP_AUTH_USER ?? "",
                        html: `<p>Olá ${firstNameClient},</p>
                        <p>Informamos que o agendamento foi <b>cancelado</b> pelo advogado ${firstNameLawyer}.</p>
                        <p><b>Justificativa:</b> ${justificativa}</p>
                        <p><b>Atenciosamente,<br> Equipe Justissimo</b></p>
                        <img src="cid:justissimo_logo"}>`,
                        subject: "Encerramento de Agendamento",
                        to: schedulingExists.contato_cliente,
                        attachments: [{
                            filename: 'logo_justissimo.png',
                            path: '././src/images/logo_justissimo.png',
                            cid: 'justissimo_logo' //same cid value as in the html img src
                        }]
                    });

                    await prisma.$transaction([ updateSheduling ]); // Realizará a transação no banco de dados (commit)

                    return;
                }
                
                await mail.sendEmail({
                    from: process.env.SMTP_AUTH_USER ?? "",
                    html: `<p>Olá ${firstNameLawyer},</p>
                    <p>Informamos que o agendamento foi <b>cancelado</b> pelo cliente ${firstNameClient}.</p>
                    <p><b>Justificativa:</b> ${justificativa}</p>
                    <p><b>Atenciosamente,<br> Equipe Justissimo</b></p>
                    <img src="cid:justissimo_logo"}>`,
                    subject: "Encerramento de Agendamento",
                    to: schedulingExists.advogado?.usuario?.email ?? "",
                    attachments: [{
                        filename: 'logo_justissimo.png',
                        path: '././src/images/logo_justissimo.png',
                        cid: 'justissimo_logo' //same cid value as in the html img src
                    }]
                });

                await prisma.$transaction([ updateSheduling ]); // Realizará a transação no banco de dados (commit)
                
                return;
            }
            
            await mail.sendEmail({
                from: process.env.SMTP_AUTH_USER ?? "",
                html: `<p>Olá,</p>
                <p>Informamos que o agendamento foi <b>encerrado</b> com sucesso!</p>
                <p><b>Justificativa:</b> ${justificativa}</p>
                <p><b>Atenciosamente,<br> Equipe Justissimo</b></p>
                <img src="cid:justissimo_logo"}>`,
                subject: "Encerramento de Agendamento",
                to: `${schedulingExists.advogado?.usuario?.email, schedulingExists.contato_cliente}`,
                attachments: [{
                    filename: 'logo_justissimo.png',
                    path: '././src/images/logo_justissimo.png',
                    cid: 'justissimo_logo' //same cid value as in the html img src
                }]
            });

            if (schedulingExists.fk_cliente == null) {
                return;
            }

            const podeAvaliar = prisma.podeAvaliar.create({
                data: {
                    fk_advogado: schedulingExists.fk_advogado,
                    fk_cliente: schedulingExists.fk_cliente ?? 0,
                }
            });
        
            await mail.sendEmail({
                from: process.env.SMTP_AUTH_USER ?? "",
                html: `<p>Olá, ${firstNameClient}</p>
                <p>Gostaríamos de informar que você já pode realizar a <b>avaliação</b> do advogado ${firstNameLawyer}!</p>
                <p><b>As avaliações são muito importantes para que outros usuários possam entender como foi sua experiência.</b></p>
                <p>
                Para realizar a avaliação, basta acessar o justíssimo, encontrar o advogado ${firstNameLawyer}, acessando o perfil do mesmo estará habilitado
                a opção <b>(Avaliar Advogado)</b> onde poderá deixar sua avaliação juntamente com um comentário.</p>
                </p>
                <p><b>Atenciosamente,<br> Equipe Justissimo</b></p>
                <img src="cid:justissimo_logo"}>`,
                subject: "Encerramento de Agendamento",
                to: `${schedulingExists.contato_cliente}`,
                attachments: [{
                    filename: 'logo_justissimo.png',
                    path: '././src/images/logo_justissimo.png',
                    cid: 'justissimo_logo' //same cid value as in the html img src
                }]
            });
            
            await prisma.$transaction([ updateSheduling, podeAvaliar ]); // Realizará a transação no banco de dados (commit)
        }
        catch (error) {
            throw new SendMailSchedulingError();
        }
    }
}

export { CloseSchedulingUseCase }