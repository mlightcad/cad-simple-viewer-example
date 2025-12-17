import { AcApContext, AcApDocManager, AcApI18n, AcEdBaseView, AcEdCommand, AcEdPreviewJig, AcEdPromptDistanceOptions, AcEdPromptPointOptions } from '@mlightcad/cad-simple-viewer'
import { AcDbEllipse, AcGePoint3d, AcGePoint3dLike, AcGeVector3d } from '@mlightcad/data-model'


export class AcApEllipseJig extends AcEdPreviewJig<number> {
  private _ellipse: AcDbEllipse

  /**
   * Creates a ellipse jig.
   *
   * @param view - The associated view
   */
  constructor(view: AcEdBaseView, center: AcGePoint3dLike, majorAxisEndPoint: AcGePoint3dLike) {
    super(view)
    const majorAxis = new AcGeVector3d(
      majorAxisEndPoint.x - center.x,
      majorAxisEndPoint.y - center.y,
      majorAxisEndPoint.z - center.z
    )
    const majorAxisRadius = majorAxis.length()
    this._ellipse = new AcDbEllipse(
      center,
      AcGeVector3d.Z_AXIS,
      majorAxis.normalize(),
      majorAxisRadius,
      majorAxisRadius,
      0,
      Math.PI * 2
    )
  }

  get entity(): AcDbEllipse {
    return this._ellipse
  }

  update(minorRadius: number) {
    this._ellipse.minorAxisRadius = minorRadius
  }
}

/**
 * Command to create one ellipse.
 */
export class AcApEllipseCmd extends AcEdCommand {
  async execute(context: AcApContext) {
    const centerPrompt = new AcEdPromptPointOptions(
      AcApI18n.t('jig.ellipse.center')
    )
    const center = await AcApDocManager.instance.editor.getPoint(centerPrompt)

    const majorAxisEndPointPrompt = new AcEdPromptPointOptions(
      AcApI18n.t('jig.ellipse.majorRadius')
    )
    majorAxisEndPointPrompt.useDashedLine = true
    majorAxisEndPointPrompt.useBasePoint = true
    const majorAxisEndPoint =
      await AcApDocManager.instance.editor.getPoint(majorAxisEndPointPrompt)

    const minorRadiusPrompt = new AcEdPromptDistanceOptions(
      AcApI18n.t('jig.ellipse.minorRadius')
    )
    minorRadiusPrompt.useDashedLine = false
    minorRadiusPrompt.basePoint = new AcGePoint3d(center)
    minorRadiusPrompt.jig = new AcApEllipseJig(context.view, center, majorAxisEndPoint)
    const minorRadius =
      await AcApDocManager.instance.editor.getDistance(minorRadiusPrompt)

    const db = context.doc.database
    const majorAxis = new AcGeVector3d(
      majorAxisEndPoint.x - center.x,
      majorAxisEndPoint.y - center.y,
      majorAxisEndPoint.z - center.z
    )
    const majorAxisRadius = majorAxis.length()
    const ellipse = new AcDbEllipse(
      center,
      AcGeVector3d.Z_AXIS,
      majorAxis.normalize(),
      majorAxisRadius,
      minorRadius,
      0,
      Math.PI * 2
    )
    db.tables.blockTable.modelSpace.appendEntity(ellipse)
  }
}
