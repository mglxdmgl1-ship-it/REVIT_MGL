// Catálogo de herramientas tal como aparece en el ribbon de KAIZEN (docs/RIBBON_MAP.md).
export interface Tool { id: string; name: string; desc: string }
export interface Domain { id: string; name: string; color: string; question: string; intro: string; tools: Tool[] }

export const DOMAINS: Domain[] = [
  {
    id: "Modeling", name: "Modelado", color: "#C0392B",
    question: "¿Cómo genero el modelo más rápido y bien?",
    intro: "Acero de refuerzo real en vigas, columnas, muros y cimentaciones; encofrados, tarrajeos, losas, excavación y solado generados desde tu modelo, no dibujados a mano.",
    tools: [
      { id: "Modeling_RebarDesigner", name: "Armar elemento", desc: "Diseña el armado de una viga o columna con croquis y lo crea en Revit." },
      { id: "Modeling_BeamLongRebar", name: "Acero vigas", desc: "Corridas por eje de pórtico que cruzan nudos, con empalmes y bastones." },
      { id: "Modeling_Stirrups", name: "Estribos", desc: "Estribos de columnas en tres zonas según la viga de mayor peralte." },
      { id: "Modeling_WallRebar", name: "Acero muros", desc: "Malla vertical y horizontal de muros agrupados por nivel y espesor." },
      { id: "Modeling_FoundationRebar", name: "Acero cimentación", desc: "Parrilla, ganchos y arranques de columna en zapatas." },
      { id: "Modeling_FormFinish", name: "Encofrado / tarrajeo", desc: "Superficies de encofrado y tarrajeo medibles, con exclusiones." },
      { id: "Modeling_FastFloor", name: "Losas / falsos pisos", desc: "Losas y contrapisos desde ambientes o contornos en segundos." },
      { id: "Modeling_ExcavationFill", name: "Excavación / relleno", desc: "Volúmenes de excavación y relleno para el metrado de movimiento de tierras." },
      { id: "Modeling_Solado", name: "Solado", desc: "Solados bajo cimentaciones seleccionadas." },
      { id: "Modeling_CrossCut", name: "Sección media", desc: "Cortes por el centro de elementos para revisar armado." },
      { id: "Modeling_SplitColumns", name: "Partir columnas", desc: "Divide columnas por niveles para metrar y armar por piso." },
    ],
  },
  {
    id: "Data", name: "Datos", color: "#0F6FC5",
    question: "¿Qué datos tiene o le faltan al modelo?",
    intro: "Excel ↔ parámetros, ambientes, ejes y estándares. Llena tu modelo de información útil para el metrado sin escribir elemento por elemento.",
    tools: [
      { id: "Data_ToParams", name: "Excel → Parámetros", desc: "Carga valores desde Excel a los parámetros de tus elementos." },
      { id: "Data_RoomAssign", name: "Asignar ambientes", desc: "Escribe en cada elemento el ambiente donde está." },
      { id: "Data_GridLocate", name: "Ubicar por ejes", desc: "Rotula cada elemento con su ubicación por ejes (A-B / 1-2)." },
      { id: "Data_RebarTakeoff", name: "Acero para metrado", desc: "Pesos y longitudes de acero listos para tu planilla." },
      { id: "Data_HostToRebarData", name: "Host → datos de acero", desc: "Hereda datos del elemento anfitrión a sus barras." },
      { id: "Data_FillElementId", name: "Llenar ElementId", desc: "Guarda el Id en un parámetro para cruzar con Excel." },
      { id: "Data_CopyStandards", name: "Copiar estándares", desc: "Lleva tipos, filtros y plantillas entre proyectos." },
      { id: "Data_ScheduleExcel", name: "Tablas → Excel", desc: "Exporta tablas de planificación a Excel con formato." },
    ],
  },
  {
    id: "Documentation", name: "Documentación", color: "#1E7A3C",
    question: "¿Cómo saco planos y tablas?",
    intro: "Etiquetado inteligente sin choques, láminas en lote, tablas a Excel y cajas de nivel 3D para presentar.",
    tools: [
      { id: "Documentation_Tagger", name: "Etiquetador", desc: "Etiqueta por categoría evitando superposiciones." },
      { id: "Documentation_OneSheets", name: "OneSheets", desc: "Exporta tus láminas en lote, con nombres ordenados." },
      { id: "Documentation_ScheduleExcel", name: "Tablas → Excel", desc: "Tus tablas de Revit directo a Excel." },
      { id: "Documentation_LevelBox", name: "Level Box 3D", desc: "Vistas 3D recortadas por nivel con un clic." },
    ],
  },
  {
    id: "Quality", name: "Calidad", color: "#7D3C98",
    question: "¿El modelo está completo y es correcto?",
    intro: "Revisa antes de entregar: parámetros vacíos, acero por color, filtros automáticos y control de exclusiones de encofrado.",
    tools: [
      { id: "Quality_ViewFilter", name: "View Filter", desc: "Explora y colorea el modelo por cualquier parámetro sin dañar la vista." },
      { id: "Quality_ParamCheck", name: "Check parámetros", desc: "Encuentra elementos con datos faltantes." },
      { id: "Quality_RebarSolidView", name: "Acero por color", desc: "Visualiza el acero por diámetro en sólido." },
      { id: "Quality_AutoFilters", name: "Filtros automáticos", desc: "Crea filtros de vista reales a partir de valores." },
      { id: "Quality_FormworkExclusions", name: "Exclusiones encofrado", desc: "Controla qué no se encofra ni se metra." },
    ],
  },
];

export const TOOL_COUNT = 31;
