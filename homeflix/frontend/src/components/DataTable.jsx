import '@/components/DataTable.css'

/**
 * Tableau de données qui s'adapte à la place disponible : un tableau classique quand il tient, une fiche par ligne
 * quand son conteneur est étroit (téléphone), sans défilement horizontal. Les rôles ARIA sont écrits en toutes lettres
 * pour que la structure reste annoncée quand la feuille de style change l'affichage des éléments.
 * @param {object} props
 * @param {string} props.caption Nom du tableau (lu par les lecteurs d'écran).
 * @param {{key: string, header: string, render: (row: object) => React.ReactNode, rowHeader?: boolean,
 *   className?: string}[]} props.columns `rowHeader` : la colonne nomme la ligne (titre de la fiche en version
 *   étroite, sans libellé). Une cellule sans contenu n'est pas affichée en version étroite.
 * @param {{id: string}[]} props.rows
 * @param {(row: object) => object} [props.rowProps] Attributs supplémentaires d'une ligne.
 */
export default function DataTable({ caption, columns, rows, rowProps }) {
  return (
    <div className="data-table">
      <table role="table" className="data-table__table">
        <caption className="visually-hidden">{caption}</caption>
        <thead role="rowgroup">
          <tr role="row">
            {columns.map((column) => (
              <th key={column.key} role="columnheader" scope="col">
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody role="rowgroup">
          {rows.map((row) => (
            <tr key={row.id} role="row" {...rowProps?.(row)}>
              {columns.map(({ key, header, render, rowHeader, className }) =>
                rowHeader ? (
                  <th key={key} role="rowheader" scope="row" className={className}>
                    {render(row)}
                  </th>
                ) : (
                  <td key={key} role="cell" data-label={header} className={className}>
                    {render(row)}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
