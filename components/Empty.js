import Icon from "@/components/Icon";
export default function Empty({ icon="building", title, text }) {
  return <div className="empty"><div className="empty-icon"><Icon name={icon} size={28}/></div><h3>{title}</h3><p>{text}</p></div>;
}
