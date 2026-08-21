class OrderItemResult {
  final String productId;
  final String productName;
  final int quantity;
  final double priceAtOrder;

  OrderItemResult({
    required this.productId,
    required this.productName,
    required this.quantity,
    required this.priceAtOrder,
  });

  factory OrderItemResult.fromJson(Map<String, dynamic> json) {
    return OrderItemResult(
      productId: json['productId'] as String,
      productName: (json['product'] as Map<String, dynamic>)['name'] as String,
      quantity: json['quantity'] as int,
      priceAtOrder: double.parse(json['priceAtOrder'].toString()),
    );
  }
}

class OrderResult {
  final String id;
  final String status;
  final String paymentStatus;
  final double totalAmount;
  final double amountPaid;
  final String? deliveryAddress;
  final DateTime createdAt;
  final List<OrderItemResult> items;

  OrderResult({
    required this.id,
    required this.status,
    required this.paymentStatus,
    required this.totalAmount,
    required this.amountPaid,
    this.deliveryAddress,
    required this.createdAt,
    required this.items,
  });

  factory OrderResult.fromJson(Map<String, dynamic> json) {
    return OrderResult(
      id: json['id'] as String,
      status: json['status'] as String,
      paymentStatus: json['paymentStatus'] as String,
      totalAmount: double.parse(json['totalAmount'].toString()),
      amountPaid: double.parse((json['amountPaid'] ?? 0).toString()),
      deliveryAddress: json['deliveryAddress'] as String?,
      createdAt: DateTime.parse(json['createdAt'] as String),
      items: (json['items'] as List<dynamic>)
          .map((e) => OrderItemResult.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }
}
