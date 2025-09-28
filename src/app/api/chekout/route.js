import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma2 = new PrismaClient();

export async function POST(request) {
  try {
    // Tu lógica anterior aquí...
    // (el código que maneja la creación de compra y tickets)
    
    // después de crear la compra y tickets:
    const pWithItems = await prisma2.purchase.findUnique({
      where: { id: result.purchaseId },
      include: { 
        items: { 
          include: { 
            product: { select: { filePath: true, bonusFilePath: true } } 
          } 
        } 
      },
    });
    
    // si hay al menos un archivo asociado a los productos de la compra,
    // creamos la entrega vacía (se firmarán al descargar)
    const hasFile = pWithItems?.items?.some((it) => it?.product?.filePath);
    if (hasFile) {
      await prisma2.deliveryDigital.upsert({
        where: { purchaseId: result.purchaseId },
        update: {},
        create: { purchaseId: result.purchaseId, downloads: 0, maxDownloads: 5 },
      });
    }
    
    // finalmente, respondés al frontend
    return NextResponse.json({
      ok: true,
      purchaseId: result.purchaseId,
    });
    
  } catch (error) {
    console.error('Error in checkout:', error);
    return NextResponse.json(
      { 
        ok: false, 
        error: error.message || 'Error interno del servidor' 
      },
      { status: 500 }
    );
  }
}