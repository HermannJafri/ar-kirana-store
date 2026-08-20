class Category {
  final String id;
  final String name;

  Category({required this.id, required this.name});

  factory Category.fromJson(Map<String, dynamic> json) {
    return Category(id: json['id'] as String, name: json['name'] as String);
  }
}

class Product {
  final String id;
  final String shopId;
  final String name;
  final String? description;
  final String? imageUrl;
  final double price;
  final String? unit;
  final int quantityAvailable;
  final bool isAvailable;
  final Category? category;

  Product({
    required this.id,
    required this.shopId,
    required this.name,
    this.description,
    this.imageUrl,
    required this.price,
    this.unit,
    required this.quantityAvailable,
    required this.isAvailable,
    this.category,
  });

  factory Product.fromJson(Map<String, dynamic> json) {
    return Product(
      id: json['id'] as String,
      shopId: json['shopId'] as String,
      name: json['name'] as String,
      description: json['description'] as String?,
      imageUrl: json['imageUrl'] as String?,
      price: double.parse(json['price'].toString()),
      unit: json['unit'] as String?,
      quantityAvailable: json['quantityAvailable'] as int,
      isAvailable: json['isAvailable'] as bool,
      category: json['category'] != null
          ? Category.fromJson(json['category'] as Map<String, dynamic>)
          : null,
    );
  }
}
