import ModalForm from "@/components/ModalForm";
import OpenModalButton from "@/components/OpenModalButton";

export default function ConfirmAction({
  action, id, title, description, triggerLabel, children, submitLabel = "Confirm", pendingLabel,
  triggerIcon = null, triggerClassName = "text-button danger"
}) {
  return <form action={action} className="confirm-action">
    <OpenModalButton target={id} icon={triggerIcon} className={triggerClassName}>{triggerLabel}</OpenModalButton>
    <ModalForm id={id} title={title} description={description} submitLabel={submitLabel} pendingLabel={pendingLabel} intent="danger">
      {children}
    </ModalForm>
  </form>;
}
