export default function PageHeading({ eyebrow, title, subtitle, aside }) {
  return (
    <header className="section-heading page-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {subtitle && <p className="section-intro">{subtitle}</p>}
      </div>
      {aside}
    </header>
  );
}
