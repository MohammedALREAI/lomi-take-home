export function TableSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="table-scroll" aria-busy="true" aria-label="Loading documents">
      <table className="docs-table">
        <thead>
          <tr>
            <th>Document</th>
            <th>Type</th>
            <th>Version</th>
            <th>Extraction</th>
            <th>Progress</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }, (_, idx) => (
            <tr key={idx}>
              <td>
                <div className="doc-cell">
                  <span className="skel skel-thumb" />
                  <div className="doc-meta" style={{ width: "180px" }}>
                    <span className="skel skel-line" style={{ width: "85%" }} />
                    <span className="skel skel-line-sm" style={{ width: "55%" }} />
                  </div>
                </div>
              </td>
              <td>
                <span className="skel skel-pill" style={{ width: "86px" }} />
              </td>
              <td>
                <span className="skel skel-pill" style={{ width: "36px" }} />
              </td>
              <td>
                <span className="skel skel-pill" style={{ width: "88px" }} />
              </td>
              <td>
                <div className="progress-stack">
                  <span className="skel skel-line-sm" style={{ width: "150px" }} />
                  <span className="skel skel-line-sm" style={{ width: "100px" }} />
                </div>
              </td>
              <td>
                <span className="skel skel-btn" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DetailSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading document details" style={{ display: "grid", gap: "20px" }}>
      <div className="detail-header">
        <div className="detail-header-left">
          <span className="skel" style={{ width: "46px", height: "46px", borderRadius: "13px" }} />
          <div style={{ display: "grid", gap: "8px" }}>
            <span className="skel skel-line" style={{ width: "280px", height: "24px" }} />
            <span className="skel skel-line-sm" style={{ width: "160px" }} />
          </div>
        </div>
        <span className="skel skel-pill" style={{ width: "130px", height: "38px" }} />
      </div>

      <div className="detail-toolbar">
        <span className="skel skel-line" style={{ width: "60%", height: "12px" }} />
        <div className="toolbar-divider" />
        <span className="skel skel-line" style={{ width: "340px", height: "38px" }} />
      </div>

      <div className="review-layout">
        <div className="cards">
          {[0, 1, 2].map((i) => (
            <div key={i} className="card" style={{ gap: "12px" }}>
              <div className="card-top">
                <div className="card-field-group">
                  <span className="skel" style={{ width: "38px", height: "38px", borderRadius: "11px" }} />
                  <div style={{ display: "grid", gap: "6px" }}>
                    <span className="skel skel-line-sm" style={{ width: "95px" }} />
                    <span className="skel skel-line" style={{ width: "150px", height: "20px" }} />
                  </div>
                </div>
                <span className="skel skel-pill" style={{ width: "96px" }} />
              </div>
              <span className="skel" style={{ width: "100%", height: "42px", borderRadius: "10px" }} />
              <div style={{ display: "flex", gap: "8px" }}>
                <span className="skel skel-btn" style={{ width: "120px" }} />
                <span className="skel skel-btn" style={{ width: "88px" }} />
              </div>
            </div>
          ))}
        </div>

        <div className="doc-viewer" style={{ minHeight: "460px" }}>
          <div className="doc-viewer-bar">
            <span className="skel skel-line" style={{ width: "140px" }} />
            <span className="skel skel-pill" style={{ width: "120px" }} />
          </div>
          <div className="doc-viewer-canvas">
            <div className="doc-paper" style={{ padding: "28px", display: "grid", gap: "12px" }}>
              <span className="skel skel-line" style={{ width: "52%" }} />
              <span className="skel skel-line-sm" style={{ width: "78%" }} />
              <span className="skel skel-line-sm" style={{ width: "68%" }} />
              <span className="skel skel-line-sm" style={{ width: "84%" }} />
              <span className="skel skel-line-sm" style={{ width: "60%" }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
